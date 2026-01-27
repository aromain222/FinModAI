"use client";

/**
 * Error Boundary Component
 * 
 * Catches React render errors and displays a graceful fallback UI.
 * Prevents the entire page from blanking when a component crashes.
 */

import React, { Component, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Copy, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleCopyError = () => {
    const { error, errorInfo } = this.state;
    const errorDetails = `
Error: ${error?.message || 'Unknown error'}
Stack: ${error?.stack || 'No stack trace'}
Component Stack: ${errorInfo?.componentStack || 'No component stack'}
    `.trim();

    navigator.clipboard.writeText(errorDetails);
    alert('Error details copied to clipboard');
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      const isDev = typeof window !== 'undefined' && 
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

      return (
        <Card className="bg-slate-950/60 border-rose-500/20 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/10">
                <AlertTriangle className="h-5 w-5 text-rose-400" />
              </div>
              <CardTitle className="text-white">Preview Unavailable</CardTitle>
            </div>
	            </CardHeader>
	          <CardContent className="space-y-4">
	            <p className="text-sm text-slate-400">
	              We couldn&apos;t render this preview due to an unexpected output shape or data format.
	            </p>
	            
	            <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-3">
	              <p className="text-xs text-rose-300 font-mono">
	                {this.state.error?.message || 'Unknown error occurred'}
	              </p>
	            </div>

            <div className="text-xs text-slate-500 space-y-1">
              <p className="font-medium text-slate-400">What you can do:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Download the Excel workbook to view full results</li>
                <li>Refresh the page to try again</li>
                <li>Contact support if the issue persists</li>
              </ul>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={this.handleReset}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-2" />
                Try Again
              </Button>
              {isDev && (
                <Button
                  onClick={this.handleCopyError}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <Copy className="h-3.5 w-3.5 mr-2" />
                  Copy Error Details
                </Button>
              )}
            </div>

            {isDev && this.state.errorInfo && (
              <details className="mt-4">
                <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400">
                  Show component stack (dev only)
                </summary>
                <pre className="mt-2 text-xs text-slate-600 overflow-auto max-h-40 bg-slate-900/40 p-2 rounded">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}
