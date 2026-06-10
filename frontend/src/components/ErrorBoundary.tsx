import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/** Friendly, child-appropriate error boundary. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('StoryWeaver crashed:', error, info);
  }

  private handleReset = () => {
    this.setState({ hasError: false });
    window.location.assign('/');
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="grid min-h-dvh place-items-center p-6 text-center">
          <div className="glass max-w-md rounded-[2rem] p-10">
            <div className="animate-float-slow mb-4 text-6xl">✨</div>
            <h1 className="font-display text-3xl text-parchment">
              Oops, the magic hiccuped! ✨
            </h1>
            <p className="mt-3 text-parchment/75">
              Don&apos;t worry — even the best stories have a little stumble. Let&apos;s
              start fresh.
            </p>
            <button
              type="button"
              onClick={this.handleReset}
              className="mt-6 min-h-[56px] rounded-full bg-firefly px-8 py-3 font-display text-lg text-night-900 transition-transform active:scale-95"
            >
              Back to the beginning
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
