export type FirebasePublicConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId?: string;
  testing: boolean;
};

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function firebaseProjectId(): string {
  return env("FIREBASE_PROJECT_ID") || env("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
}

export function getFirebasePublicConfig(): FirebasePublicConfig | null {
  const apiKey = env("FIREBASE_API_KEY") || env("NEXT_PUBLIC_FIREBASE_API_KEY");
  const authDomain = env("FIREBASE_AUTH_DOMAIN") || env("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
  const projectId = firebaseProjectId();
  const appId = env("FIREBASE_APP_ID") || env("NEXT_PUBLIC_FIREBASE_APP_ID");
  const messagingSenderId = env("FIREBASE_MESSAGING_SENDER_ID") || env("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID");
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    messagingSenderId: messagingSenderId || undefined,
    testing: env("FIREBASE_AUTH_TESTING") === "1" || env("NEXT_PUBLIC_FIREBASE_AUTH_TESTING") === "1",
  };
}

export function isFirebaseAuthConfigured(): boolean {
  return getFirebasePublicConfig() !== null;
}
