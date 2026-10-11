package dev.jobflow.admin;

import dev.jobflow.auth.Hashing;
import dev.jobflow.user.UserRepo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/** Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD if that account does not exist yet. */
@Component
@Profile("!worker")
public class AdminBootstrap implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);
    private final UserRepo users;
    private final PasswordEncoder enc;
    private final String email, password;

    public AdminBootstrap(UserRepo users, PasswordEncoder enc, @Value("${app.admin.email:}") String email, @Value("${app.admin.password:}") String password) {
        this.users = users; this.enc = enc; this.email = email; this.password = password;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (email.isBlank() || password.length() < 8 || users.byEmail(email).isPresent()) return;
        users.create(email, enc.encode(password), "ADMIN", Hashing.randomHex(24));
        log.info("bootstrap admin account created");
    }
}
