-- The ticket creation endpoint previously marked a message authored by an
-- administrator as a staff reply, even when that administrator opened their
-- own customer ticket. Only correct the first, non-internal message.
UPDATE "TicketMessage" AS message
SET "fromAdmin" = false
FROM "Ticket" AS ticket
JOIN "User" AS author ON author."id" = ticket."userId"
WHERE message."ticketId" = ticket."id"
  AND message."userId" = ticket."userId"
  AND author."role" = 'ADMIN'
  AND message."fromAdmin" = true
  AND message."internal" = false
  AND message."id" = (
    SELECT MIN(first_message."id")
    FROM "TicketMessage" AS first_message
    WHERE first_message."ticketId" = ticket."id"
  );
