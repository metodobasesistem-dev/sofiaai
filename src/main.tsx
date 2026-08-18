import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

import { FeatureFlagProvider } from './contexts/FeatureFlagContext.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <FeatureFlagProvider>
          <App />
        </FeatureFlagProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
