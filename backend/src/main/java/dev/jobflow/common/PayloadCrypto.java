package dev.jobflow.common;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class PayloadCrypto {
    private static final String PREFIX = "enc:v1:";
    private static final int GCM_IV_LENGTH = 12;
    private static final int GCM_TAG_LENGTH = 128;

    private final String configuredKey;
    private final ObjectMapper om;
    private SecretKey secretKey;
    private final SecureRandom random = new SecureRandom();

    public PayloadCrypto(@Value("${app.crypto.key:}") String configuredKey, ObjectMapper om) {
        this.configuredKey = configuredKey;
        this.om = om;
    }

    @PostConstruct
    public void init() {
        if (configuredKey == null || configuredKey.isBlank()) {
            throw new IllegalStateException("Missing required configuration property: app.crypto.key");
        }
        byte[] decoded;
        try {
            decoded = Base64.getDecoder().decode(configuredKey.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("Property app.crypto.key is not valid Base64", e);
        }
        if (decoded.length != 32) {
            throw new IllegalStateException("Property app.crypto.key must decode to exactly 32 bytes (AES-256), but was " + decoded.length + " bytes");
        }
        this.secretKey = new SecretKeySpec(decoded, "AES");
    }

    public boolean isEncrypted(String s) {
        return s != null && s.startsWith(PREFIX);
    }

    public String encrypt(String plaintext) {
        if (plaintext == null) return null;
        try {
            byte[] iv = new byte[GCM_IV_LENGTH];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, new GCMParameterSpec(GCM_TAG_LENGTH, iv));
            byte[] cipherBytes = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            byte[] combined = new byte[iv.length + cipherBytes.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(cipherBytes, 0, combined, iv.length, cipherBytes.length);
            return PREFIX + Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            throw new RuntimeException("Payload encryption failed", e);
        }
    }

    public String decrypt(String ciphertext) {
        if (ciphertext == null) return null;
        if (!isEncrypted(ciphertext)) return ciphertext;
        try {
            byte[] combined = Base64.getDecoder().decode(ciphertext.substring(PREFIX.length()));
            if (combined.length < GCM_IV_LENGTH) {
                throw new IllegalArgumentException("Invalid encrypted payload length");
            }
            byte[] iv = new byte[GCM_IV_LENGTH];
            byte[] cipherBytes = new byte[combined.length - GCM_IV_LENGTH];
            System.arraycopy(combined, 0, iv, 0, GCM_IV_LENGTH);
            System.arraycopy(combined, GCM_IV_LENGTH, cipherBytes, 0, cipherBytes.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, secretKey, new GCMParameterSpec(GCM_TAG_LENGTH, iv));
            byte[] plainBytes = cipher.doFinal(cipherBytes);
            return new String(plainBytes, StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new RuntimeException("Payload decryption failed", e);
        }
    }

    public JsonNode protect(String type, JsonNode payload) {
        if (payload == null || !payload.isObject()) return payload;
        JsonNode copy = payload.deepCopy();
        if (!"HTTP_CALL".equalsIgnoreCase(type)) return copy;
        ObjectNode obj = (ObjectNode) copy;
        if (obj.has("headers") && obj.get("headers").isObject()) {
            ObjectNode headers = (ObjectNode) obj.get("headers");
            headers.fields().forEachRemaining(entry -> {
                if (entry.getValue().isTextual()) {
                    String val = entry.getValue().asText();
                    if (!isEncrypted(val)) {
                        headers.put(entry.getKey(), encrypt(val));
                    }
                }
            });
        }
        if (obj.hasNonNull("body")) {
            JsonNode bodyNode = obj.get("body");
            String bodyStr = bodyNode.isTextual() ? bodyNode.asText() : bodyNode.toString();
            if (!isEncrypted(bodyStr)) {
                obj.put("body", encrypt(bodyStr));
            }
        }
        return copy;
    }

    public JsonNode mask(String type, JsonNode payload) {
        if (payload == null || !payload.isObject()) return payload;
        JsonNode copy = payload.deepCopy();
        if (!"HTTP_CALL".equalsIgnoreCase(type)) return copy;
        ObjectNode obj = (ObjectNode) copy;
        if (obj.has("headers") && obj.get("headers").isObject()) {
            ObjectNode headers = (ObjectNode) obj.get("headers");
            headers.fields().forEachRemaining(entry -> {
                headers.put(entry.getKey(), "[hidden]");
            });
        }
        if (obj.hasNonNull("body")) {
            obj.put("body", "[hidden]");
        }
        return copy;
    }
}
