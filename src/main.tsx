import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

import { FeatureFlagProvider } from './contexts/FeatureFlagContext.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <FeatureFlagProvider>
        <App />
      </FeatureFlagProvider>
    </ErrorBoundary>
  </StrictMode>,
);
