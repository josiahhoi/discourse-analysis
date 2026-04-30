/**
 * Firebase Cloud Sync Service
 */

const firebaseConfig = {
  apiKey: "AIzaSyCflZaQ0TdXImPp5-eSdpq8mkclJaltzDU",
  authDomain: "discourse-analysis-f4a8e.firebaseapp.com",
  projectId: "discourse-analysis-f4a8e",
  storageBucket: "discourse-analysis-f4a8e.firebasestorage.app",
  messagingSenderId: "628335300315",
  appId: "1:628335300315:web:d26312b8d26e83ebbf06fe",
  measurementId: "G-YHGZ85KGFS"
};

// Initialize Firebase
if (typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
}

window.db = typeof firebase !== 'undefined' ? firebase.firestore() : null;
