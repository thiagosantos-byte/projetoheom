import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

type ErrorBoundaryState = { error: Error | null };

class AppErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[HEOM] Erro durante a renderização da interface:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="app-crash-screen" role="alert" aria-labelledby="app-crash-title">
          <div className="app-crash-card">
            <div className="brand-mark" aria-hidden="true">HEOM</div>
            <p className="eyebrow">HEOM · DIAGNÓSTICO DA INTERFACE</p>
            <h1 id="app-crash-title">Não foi possível exibir esta tela</h1>
            <p>O sistema encontrou um erro ao montar um componente. Nenhum dado foi apagado por esta falha.</p>
            <pre>{this.state.error.message || 'Erro de renderização não identificado.'}</pre>
            <p className="app-crash-help">Atualize a página. Se o problema continuar, envie esta mensagem e o primeiro erro vermelho do Console ao suporte.</p>
            <button className="button button-primary" type="button" onClick={() => window.location.reload()}>Recarregar o HEOM</button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
