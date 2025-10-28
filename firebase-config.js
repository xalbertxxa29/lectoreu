// firebase-config.js
const firebaseConfig = {
  apiKey: "AIzaSyDWp0qOWaL-gLWYG-4zvQ-wpSQOJpvGgVg",
  authDomain: "incidencias-85d73.firebaseapp.com",
  databaseURL: "https://incidencias-85d73-default-rtdb.firebaseio.com",
  projectId: "incidencias-85d73",
  storageBucket: "incidencias-85d73.appspot.com",   // <-- correcto
  messagingSenderId: "102993226446",
  appId: "1:102993226446:web:9f02b8507d8c0b78f57e9f",
  measurementId: "G-NYME41GZ1B"
};

// Muy importante: exponer la config globalmente
window.firebaseConfig = firebaseConfig;
