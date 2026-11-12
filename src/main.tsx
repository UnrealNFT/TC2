import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { createParticles } from './particles';

// Initialize particle system
createParticles();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);