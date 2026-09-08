"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import type { FirebasePublicConfig } from "./firebase-config";

let cachedKey = "";

function firebaseApp(config: FirebasePublicConfig): FirebaseApp {
  const key = `${config.apiKey}:${config.projectId}:${config.appId}`;
  if (getApps().length && cachedKey === key) return getApp();
  if (getApps().length && cachedKey !== key) {
    return getApp();
  }
  cachedKey = key;
  return initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    appId: config.appId,
    messagingSenderId: config.messagingSenderId,
  });
}

export function getFirebaseAuth(config: FirebasePublicConfig): Auth {
  const auth = getAuth(firebaseApp(config));
  auth.useDeviceLanguage();
  if (config.testing) {
    auth.settings.appVerificationDisabledForTesting = true;
  }
  return auth;
}
