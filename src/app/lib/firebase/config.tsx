import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBv5VayQ8ybcZYfnCPiezafjpbrBDXUW4U",
  authDomain: "greenhouse-management-sy-7713b.firebaseapp.com",
  projectId: "greenhouse-management-sy-7713b",
  storageBucket: "greenhouse-management-sy-7713b.firebasestorage.app",
  messagingSenderId: "120549657650",
  appId: "1:120549657650:web:d456bbd2eef715fe70802b",
  measurementId: "G-32FJQCPC1G"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const firestore = getFirestore(app);
const auth = getAuth(app);
const database = getDatabase(app);


export {app, auth, firestore, database};