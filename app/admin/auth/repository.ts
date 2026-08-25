import type {
  AdminAuthQuery,
  AdminAuthRepository,
  AdminLoginAttempt,
  AdminSession,
  AdminUser,
} from "./types";

const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_FAILURE_WINDOW_SECONDS = 15 * 60;

function toIsoString(value: Date) {
  return value.toISOString();
}

export function createAdminAuthRepository(query: AdminAuthQuery): AdminAuthRepository {
  return {
    async findActiveUserByEmail(email) {
      const rows = await query(
        `
          select id::text, email, name, password_hash, salt
          from admin_users
          where email = $1 and active
          limit 1
        `,
        [email],
      );
      const row = rows[0];
      if (!row) return null;

      return {
        id: String(row.id),
        email: String(row.email),
        name: String(row.name),
        passwordHash: String(row.password_hash),
        salt: String(row.salt),
      } satisfies AdminUser;
    },

    async createSessionForUser(userId, tokenHash, now, expiresAt) {
      await query(
        `
          with updated_user as (
            update admin_users
            set last_login_at = $3::timestamptz
            where id = $1 and active
            returning id
          )
          insert into admin_sessions (user_id, token_hash, created_at, expires_at)
          select id, $2, $3::timestamptz, $4::timestamptz
          from updated_user
        `,
        [userId, tokenHash, toIsoString(now), toIsoString(expiresAt)],
      );
    },

    async findValidSession(tokenHash, now) {
      const rows = await query(
        `
          select s.user_id::text as user_id, u.name as user_name, s.expires_at
          from admin_sessions as s
          join admin_users as u on u.id = s.user_id
          where s.token_hash = $1
            and s.expires_at > $2::timestamptz
            and u.active
          limit 1
        `,
        [tokenHash, toIsoString(now)],
      );
      const row = rows[0];
      if (!row) return null;

      return {
        userId: String(row.user_id),
        userName: String(row.user_name),
        expiresAt: new Date(String(row.expires_at)),
      } satisfies AdminSession;
    },

    async renewSession(tokenHash, expiresAt, now) {
      const rows = await query(
        `
          update admin_sessions as s
          set expires_at = $2::timestamptz
          from admin_users as u
          where s.token_hash = $1
            and s.user_id = u.id
            and u.active
            and s.expires_at > $3::timestamptz
          returning s.token_hash
        `,
        [tokenHash, toIsoString(expiresAt), toIsoString(now)],
      );
      return rows.length > 0;
    },

    async deleteSession(tokenHash) {
      await query("delete from admin_sessions where token_hash = $1", [tokenHash]);
    },

    async deleteSessionsForUser(userId) {
      await query("delete from admin_sessions where user_id = $1", [userId]);
    },

    async findCurrentLoginAttempt(keyHash, now) {
      const rows = await query(
        `
          select failure_count, blocked_until
          from admin_login_attempts
          where key_hash = $1
            and window_started_at > $2::timestamptz - ($3 * interval '1 second')
          limit 1
        `,
        [keyHash, toIsoString(now), LOGIN_FAILURE_WINDOW_SECONDS],
      );
      const row = rows[0];
      if (!row) return null;

      return {
        failureCount: Number(row.failure_count),
        blockedUntil: row.blocked_until ? new Date(String(row.blocked_until)) : null,
      } satisfies AdminLoginAttempt;
    },

    async recordLoginFailure(keyHash, now) {
      const rows = await query(
        `
          insert into admin_login_attempts as attempts (
            key_hash,
            failure_count,
            window_started_at,
            blocked_until,
            updated_at
          )
          values ($1, 1, $2::timestamptz, null, $2::timestamptz)
          on conflict (key_hash) do update
          set
            failure_count = case
              when attempts.window_started_at <= excluded.updated_at - ($4 * interval '1 second') then 1
              else attempts.failure_count + 1
            end,
            window_started_at = case
              when attempts.window_started_at <= excluded.updated_at - ($4 * interval '1 second') then excluded.updated_at
              else attempts.window_started_at
            end,
            blocked_until = case
              when (
                case
                  when attempts.window_started_at <= excluded.updated_at - ($4 * interval '1 second') then 1
                  else attempts.failure_count + 1
                end
              ) >= $3 then (
                case
                  when attempts.window_started_at <= excluded.updated_at - ($4 * interval '1 second') then excluded.updated_at
                  else attempts.window_started_at
                end
              ) + ($4 * interval '1 second')
              else null
            end,
            updated_at = excluded.updated_at
          returning failure_count, blocked_until, window_started_at
        `,
        [keyHash, toIsoString(now), LOGIN_FAILURE_LIMIT, LOGIN_FAILURE_WINDOW_SECONDS],
      );
      const row = rows[0];
      if (!row) throw new Error("No se pudo registrar el intento de acceso.");

      return {
        failureCount: Number(row.failure_count),
        blockedUntil: row.blocked_until ? new Date(String(row.blocked_until)) : null,
      } satisfies AdminLoginAttempt;
    },

    async clearLoginAttempt(keyHash) {
      await query("delete from admin_login_attempts where key_hash = $1", [keyHash]);
    },

    async deleteExpiredData(now) {
      const rows = await query(
        `
          with deleted_sessions as (
            delete from admin_sessions
            where expires_at <= $1::timestamptz
            returning 1
          ), deleted_attempts as (
            delete from admin_login_attempts
            where updated_at <= $1::timestamptz - interval '15 minutes'
            returning 1
          )
          select
            (select count(*) from deleted_sessions)::integer as deleted_sessions,
            (select count(*) from deleted_attempts)::integer as deleted_attempts
        `,
        [toIsoString(now)],
      );
      const row = rows[0] ?? {};
      return {
        deletedSessions: Number(row.deleted_sessions ?? 0),
        deletedAttempts: Number(row.deleted_attempts ?? 0),
      };
    },

    async upsertAdminUser({ email, name, passwordHash, salt, now }) {
      await query(
        `
          with saved_user as (
            insert into admin_users (email, name, password_hash, salt, created_at, active)
            values ($1, $2, $3, $4, $5::timestamptz, true)
            on conflict (email) do update
            set
              name = excluded.name,
              password_hash = excluded.password_hash,
              salt = excluded.salt,
              active = true
            returning id
          )
          delete from admin_sessions
          where user_id = (select id from saved_user)
        `,
        [email, name, passwordHash, salt, toIsoString(now)],
      );
    },
  };
}
