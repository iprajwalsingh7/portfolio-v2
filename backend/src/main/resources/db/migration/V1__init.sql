-- Initial schema. PostgreSQL dialect; the dev and test profiles let Hibernate
-- build the schema from the entities instead.
--
-- Types here deliberately mirror exactly what Hibernate 6 emits for the mapped
-- Java types — varchar for String, `timestamp(6) with time zone` for Instant.
-- Hibernate's schema validator compares type names as text, so char(64) against a
-- String mapped to varchar(64) reads as a mismatch even though the column is
-- perfectly usable.

-- Contact submissions. The database is the source of truth for a submission —
-- the notification email is best-effort, so nothing is lost if SMTP fails.
create table contact_message (
    id         varchar(36)   primary key,
    name       varchar(80)   not null,
    email      varchar(180)  not null,
    body       varchar(4000) not null,
    ip_hash    varchar(64),
    user_agent varchar(300),
    created_at timestamp(6) with time zone not null,
    notified   boolean       not null default false
);

create index idx_contact_created on contact_message (created_at desc);
create index idx_contact_email   on contact_message (email);

-- Per-day unique view totals.
--
-- The column is `view_date`, not `day`: DAY is a reserved word in H2 2.x (and in
-- SQL:2016 generally). Hibernate quotes reserved identifiers in the SQL it
-- generates, so JPQL keeps working either way — but the hand-written native
-- upserts below do not get that treatment, and they fail to parse. Renaming is
-- the fix; quoting everywhere would only postpone the next occurrence.
create table daily_views (
    view_date date   primary key,
    total    bigint not null default 0 check (total >= 0)
);

-- Dedupe ledger. The composite primary key *is* the uniqueness check: the
-- application inserts with ON CONFLICT DO NOTHING and reads the affected-row
-- count as its answer, so uniqueness is enforced by the database, atomically,
-- with no read-then-write to race on.
--
-- ip_hash is a salted SHA-256, never a raw address: enough to deduplicate and
-- spot abuse, not enough to identify anyone.
create table visitor_seen (
    ip_hash  varchar(64) not null,
    view_date date        not null,
    primary key (ip_hash, view_date)
);

-- Supports the nightly retention job without scanning the table.
create index idx_visitor_seen_day on visitor_seen (view_date);
