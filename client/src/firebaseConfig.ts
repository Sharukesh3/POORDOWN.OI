// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCC6CcJOldTcN9UT8yxjxo0gMpO-gzBkBU",
  authDomain: "poordown-oi.firebaseapp.com",
  projectId: "poordown-oi",
  storageBucket: "poordown-oi.firebasestorage.app",
  messagingSenderId: "208742001863",
  appId: "1:208742001863:web:3b34d40f9c8a9eeeabe2e2",
  measurementId: "G-8D7XS7XFGS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Initialize Services
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;