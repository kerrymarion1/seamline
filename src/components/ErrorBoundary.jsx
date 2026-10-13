import { Component } from 'react'

// Catches a crash anywhere in the app so the screen says what happened and
// offers a way back, instead of going blank.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('Seamline crashed', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="screen">
        <div className="empty">
          <h2>Something went wrong</h2>
          <p>This page could not be shown. Your albums and collages are safe.</p>
          <p className="note">{String(this.state.error?.message ?? this.state.error)}</p>
          <button className="primary" onClick={() => window.location.assign('/')}>Back to the start</button>
        </div>
      </div>
    )
  }
}
