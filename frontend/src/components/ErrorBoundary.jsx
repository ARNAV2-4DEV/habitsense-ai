import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled error in app tree:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-6">
        <div className="font-display text-2xl mb-2">Something went wrong</div>
        <p className="text-white/50 mb-6 max-w-sm text-sm">
          {this.state.error.message || 'An unexpected error interrupted this page.'}
        </p>
        <button
          onClick={() => this.setState({ error: null })}
          className="inline-flex items-center gap-2 text-sm border border-white/15 rounded-full px-4 py-2 text-white/70 hover:text-white hover:border-white/30 transition-colors"
        >
          Try again
        </button>
      </div>
    )
  }
}
