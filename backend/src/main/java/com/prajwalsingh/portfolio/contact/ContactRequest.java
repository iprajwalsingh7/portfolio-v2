package com.prajwalsingh.portfolio.contact;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Inbound contact payload.
 *
 * Messages here are what the visitor sees under the field, so they are written as
 * instructions rather than as validator jargon.
 *
 * @param company honeypot. Hidden off-screen in the form, so a human never fills
 *                it and anything present means a bot. Not annotated — it is
 *                checked in the service, which answers with a fake success rather
 *                than a 400. Telling a bot it failed only invites a retry with the
 *                field removed.
 */
public record ContactRequest(

        @NotBlank(message = "Tell me what to call you.")
        @Size(min = 2, max = 80, message = "Between 2 and 80 characters, please.")
        String name,

        @NotBlank(message = "I need an address to reply to.")
        @Email(message = "That email looks off.")
        @Size(max = 180, message = "That address is too long.")
        String email,

        @NotBlank(message = "The message is empty.")
        @Size(min = 10, max = 4000, message = "Between 10 and 4000 characters, please.")
        String message,

        String company
) {

    /**
     * Normalises on construction, which is the only place that gets the ordering
     * right. Bean Validation runs against the constructed object, so trimming
     * afterwards would mean "  A  " satisfying @Size(min = 2) and then being stored
     * as a single character.
     */
    public ContactRequest {
        name = name == null ? null : name.trim();
        email = email == null ? null : email.trim().toLowerCase(java.util.Locale.ROOT);
        message = message == null ? null : message.trim();
    }

    boolean looksAutomated() {
        return company != null && !company.isBlank();
    }
}
