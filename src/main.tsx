import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import LegalPage, { LEGAL_PATHS } from './components/LegalPage';
import './style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{LEGAL_PATHS.includes(window.location.pathname.replace(/\/$/, '')) ? <LegalPage path={window.location.pathname.replace(/\/$/, '')} /> : <App />}</React.StrictMode>,
);
