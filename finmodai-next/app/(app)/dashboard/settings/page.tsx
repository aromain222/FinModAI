"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { APP_NAME } from '@/lib/branding';
import type { AppSettings } from '@/lib/settings/schema';
import { useToast } from '@/hooks/use-toast';
import { ToastEnhanced } from '@/components/ui/toast-enhanced';

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const { toasts, showToast, removeToast } = useToast();

  // Load settings on mount
  useEffect(() => {
    loadSettings();
    loadSystemStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only init
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      showToast({ title: 'Error', description: 'Failed to load settings', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadSystemStatus = async () => {
    try {
      const res = await fetch('/api/system/status');
      if (res.ok) {
        const data = await res.json();
        setSystemStatus(data);
      }
    } catch (error) {
      console.error('Failed to load system status:', error);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      
      if (res.ok) {
        showToast({ title: 'Saved', description: 'Settings saved successfully' });
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      showToast({ title: 'Error', description: 'Failed to save settings', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const updateSettings = (path: string, value: any) => {
    if (!settings) return;
    
    const keys = path.split('.');
    const updated = JSON.parse(JSON.stringify(settings));
    let current = updated;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    setSettings(updated);
  };

  if (loading || !settings) {
    return (
      <main className="min-h-screen bg-[var(--cb-bg)] px-6 py-10">
        <div className="mx-auto max-w-4xl">
          <p className="text-[var(--cb-text-muted)]">Loading settings...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--cb-bg)] px-6 py-10 text-[var(--cb-text-body)]">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <header className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-wide text-[var(--cb-green)]">
              {APP_NAME} Settings
            </p>
            <h1 className="text-3xl font-bold text-[var(--cb-text-primary)]">Settings</h1>
            <p className="text-base text-[var(--cb-text-secondary)]">
              Manage defaults, guardrails, and preferences.
            </p>
          </header>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
            <Button asChild variant="outline">
              <Link href="/app">Back to Dashboard</Link>
            </Button>
          </div>
        </div>

        {/* Profile */}
        <Card className="border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
          <CardHeader>
            <CardTitle className="text-[var(--cb-text-primary)]">Profile</CardTitle>
            <CardDescription>Your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[var(--cb-text-primary)]">Email</Label>
              <Input
                id="email"
                type="text"
                value="analyst@capitalbase.app"
                disabled
                className="bg-[var(--cb-surface-alt)] text-[var(--cb-text-muted)]"
              />
              <p className="text-xs text-[var(--cb-text-muted)]">Email is managed by your account provider</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName" className="text-[var(--cb-text-primary)]">Display Name</Label>
              <Input
                id="displayName"
                type="text"
                value={''}
                onChange={(e) => {}}
                placeholder="Analyst"
                className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="orgName" className="text-[var(--cb-text-primary)]">Organization Name</Label>
              <Input
                id="orgName"
                type="text"
                value={''}
                onChange={(e) => {}}
                placeholder="Your Organization"
                className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                disabled
              />
            </div>
          </CardContent>
        </Card>

        {/* Model Defaults section temporarily disabled - schema needs update */}

        {/* Guardrails and Model Defaults sections temporarily disabled - schema needs update */}

        {/* Data Preferences and Reporting sections temporarily disabled - schema needs update */}

        {/* System Status */}
        {/* System Status */}
        <Card className="border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
          <CardHeader>
            <CardTitle className="text-[var(--cb-text-primary)]">System Status</CardTitle>
            <CardDescription>Read-only diagnostics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-[var(--cb-text-muted)]">
              API keys are loaded from <code className="rounded bg-[var(--cb-surface-alt)] px-1 py-0.5 font-mono text-xs">.env.local</code>
            </p>
            {systemStatus && (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--cb-text-secondary)]">OpenAI API</p>
                    <p className="text-xs text-[var(--cb-text-muted)]">Required for AI analysis</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                    systemStatus.openaiConfigured
                      ? 'bg-[var(--cb-green)]/15 text-[var(--cb-green)]'
                      : 'bg-[var(--cb-danger)]/15 text-[var(--cb-danger)]'
                  }`}>
                    {systemStatus.openaiConfigured ? 'Configured' : 'Not Configured'}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--cb-text-secondary)]">Polygon API</p>
                    <p className="text-xs text-[var(--cb-text-muted)]">Financial data provider</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                    systemStatus.polygonConfigured
                      ? 'bg-[var(--cb-green)]/15 text-[var(--cb-green)]'
                      : 'bg-slate-200/70 px-2 py-1 text-xs font-medium text-slate-700'
                  }`}>
                    {systemStatus.polygonConfigured ? 'Configured' : 'Optional'}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--cb-text-secondary)]">FMP API</p>
                    <p className="text-xs text-[var(--cb-text-muted)]">Financial data provider</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                    systemStatus.fmpConfigured
                      ? 'bg-[var(--cb-green)]/15 text-[var(--cb-green)]'
                      : 'bg-slate-200/70 px-2 py-1 text-xs font-medium text-slate-700'
                  }`}>
                    {systemStatus.fmpConfigured ? 'Configured' : 'Optional'}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--cb-text-secondary)]">Alpha Vantage API</p>
                    <p className="text-xs text-[var(--cb-text-muted)]">Financial data provider</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                    systemStatus.alphavantageConfigured
                      ? 'bg-[var(--cb-green)]/15 text-[var(--cb-green)]'
                      : 'bg-slate-200/70 px-2 py-1 text-xs font-medium text-slate-700'
                  }`}>
                    {systemStatus.alphavantageConfigured ? 'Configured' : 'Optional'}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      <ToastEnhanced toasts={toasts} onRemove={removeToast} />
    </main>
  );
}
