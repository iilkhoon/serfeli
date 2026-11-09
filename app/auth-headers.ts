// Shared by app/auth.ts and the local sign-in plugin, which loads before the app and must not
// import Next modules.
export const USER_ID_HEADER = "x-qepik-user-id";
export const USER_EMAIL_HEADER = "x-qepik-user-email";
export const USER_NAME_HEADER = "x-qepik-user-name";
export const SIGN_IN_PATH = "/giris";
export const SIGN_OUT_PATH = "/cixis";
