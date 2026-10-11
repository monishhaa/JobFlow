package dev.jobflow;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Run with profile "api" (HTTP only), "worker" (executes jobs) or no profile (both, for local dev and tests). */
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
@EnableScheduling
public class JobflowApplication {
    public static void main(String[] args) {
        SpringApplication.run(JobflowApplication.class, args);
    }
}
