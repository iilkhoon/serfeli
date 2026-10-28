declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    /** Optional: the only account email allowed to claim the first admin/owner slot. */
    OWNER_EMAIL?: string;
  }
}
