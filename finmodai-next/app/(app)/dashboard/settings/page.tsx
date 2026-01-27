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
                value={settings.profile.displayName || ''}
                onChange={(e) => updateSettings('profile.displayName', e.target.value || undefined)}
                placeholder="Analyst"
                className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="orgName" className="text-[var(--cb-text-primary)]">Organization Name</Label>
              <Input
                id="orgName"
                type="text"
                value={settings.profile.orgName || ''}
                onChange={(e) => updateSettings('profile.orgName', e.target.value || undefined)}
                placeholder="Your Organization"
                className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
              />
            </div>
          </CardContent>
        </Card>

        {/* Model Defaults */}
        <Card className="border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
          <CardHeader>
            <CardTitle className="text-[var(--cb-text-primary)]">Model Defaults</CardTitle>
            <CardDescription>Default values applied when model inputs are missing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Valuation Defaults */}
            <div className="space-y-4 border-l-2 border-[var(--cb-border-subtle)] pl-4">
              <h3 className="font-semibold text-[var(--cb-text-primary)]">Valuation (DCF, 3-Statement)</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="taxRate" className="text-[var(--cb-text-primary)]">Tax Rate (%)</Label>
                  <Input
                    id="taxRate"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={settings.defaults.valuation.taxRate ? settings.defaults.valuation.taxRate * 100 : ''}
                    onChange={(e) => updateSettings('defaults.valuation.taxRate', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="terminalGrowth" className="text-[var(--cb-text-primary)]">Terminal Growth (%)</Label>
                  <Input
                    id="terminalGrowth"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={settings.defaults.valuation.terminalGrowth ? settings.defaults.valuation.terminalGrowth * 100 : ''}
                    onChange={(e) => updateSettings('defaults.valuation.terminalGrowth', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="forecastYears" className="text-[var(--cb-text-primary)]">Forecast Years</Label>
                  <Input
                    id="forecastYears"
                    type="number"
                    min="1"
                    max="10"
                    value={settings.defaults.valuation.forecastYears || ''}
                    onChange={(e) => updateSettings('defaults.valuation.forecastYears', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wacc" className="text-[var(--cb-text-primary)]">WACC (%)</Label>
                  <Input
                    id="wacc"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={settings.defaults.valuation.wacc ? settings.defaults.valuation.wacc * 100 : ''}
                    onChange={(e) => updateSettings('defaults.valuation.wacc', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                    placeholder="Optional"
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
              </div>
            </div>

            {/* LBO Defaults */}
            <div className="space-y-4 border-l-2 border-[var(--cb-border-subtle)] pl-4">
              <h3 className="font-semibold text-[var(--cb-text-primary)]">LBO</h3>
              <p className="text-xs text-[var(--cb-text-muted)]">
                Not used in LBO yet (DCF / v2 feature)
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="holdPeriod" className="text-[var(--cb-text-primary)]">Hold Period (Years)</Label>
                  <Input
                    id="holdPeriod"
                    type="number"
                    min="1"
                    max="10"
                    value={settings.defaults.lbo.holdPeriodYears || ''}
                    onChange={(e) => updateSettings('defaults.lbo.holdPeriodYears', e.target.value ? parseInt(e.target.value) : undefined)}
                    disabled
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="interestRate" className="text-[var(--cb-text-primary)]">Interest Rate (%)</Label>
                  <Input
                    id="interestRate"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={settings.defaults.lbo.interestRate ? settings.defaults.lbo.interestRate * 100 : ''}
                    onChange={(e) => updateSettings('defaults.lbo.interestRate', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                    disabled
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="minCash" className="text-[var(--cb-text-primary)]">Min Cash ($)</Label>
                  <Input
                    id="minCash"
                    type="number"
                    min="0"
                    value={settings.defaults.lbo.minCash || ''}
                    onChange={(e) => updateSettings('defaults.lbo.minCash', e.target.value ? parseFloat(e.target.value) : undefined)}
                    disabled
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="feesPct" className="text-[var(--cb-text-primary)]">Fees (%)</Label>
                  <Input
                    id="feesPct"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={settings.defaults.lbo.feesPct ? settings.defaults.lbo.feesPct * 100 : ''}
                    onChange={(e) => updateSettings('defaults.lbo.feesPct', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                    disabled
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
              </div>
            </div>

            {/* Merger Defaults */}
            <div className="space-y-4 border-l-2 border-[var(--cb-border-subtle)] pl-4">
              <h3 className="font-semibold text-[var(--cb-text-primary)]">Merger</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mergerTaxRate" className="text-[var(--cb-text-primary)]">Tax Rate (%)</Label>
                  <Input
                    id="mergerTaxRate"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={settings.defaults.merger.taxRate ? settings.defaults.merger.taxRate * 100 : ''}
                    onChange={(e) => updateSettings('defaults.merger.taxRate', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newDebtRate" className="text-[var(--cb-text-primary)]">New Debt Rate (%)</Label>
                  <Input
                    id="newDebtRate"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={settings.defaults.merger.newDebtRate ? settings.defaults.merger.newDebtRate * 100 : ''}
                    onChange={(e) => updateSettings('defaults.merger.newDebtRate', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="intangiblesPct" className="text-[var(--cb-text-primary)]">Intangibles %</Label>
                  <Input
                    id="intangiblesPct"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={settings.defaults.merger.intangiblesPct ? settings.defaults.merger.intangiblesPct * 100 : ''}
                    onChange={(e) => updateSettings('defaults.merger.intangiblesPct', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="intangiblesLife" className="text-[var(--cb-text-primary)]">Intangibles Life (Years)</Label>
                  <Input
                    id="intangiblesLife"
                    type="number"
                    min="1"
                    max="20"
                    value={settings.defaults.merger.intangiblesLifeYears || ''}
                    onChange={(e) => updateSettings('defaults.merger.intangiblesLifeYears', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
              </div>
            </div>

            {/* Operating Defaults */}
            <div className="space-y-4 border-l-2 border-[var(--cb-border-subtle)] pl-4">
              <h3 className="font-semibold text-[var(--cb-text-primary)]">Operating</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="forecastMonths" className="text-[var(--cb-text-primary)]">Forecast Months</Label>
                  <Input
                    id="forecastMonths"
                    type="number"
                    min="12"
                    max="36"
                    value={settings.defaults.operating.forecastMonths || ''}
                    onChange={(e) => updateSettings('defaults.operating.forecastMonths', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="revenueModel" className="text-[var(--cb-text-primary)]">Revenue Model Default</Label>
                  <select
                    id="revenueModel"
                    value={settings.defaults.operating.revenueModelDefault || ''}
                    onChange={(e) => updateSettings('defaults.operating.revenueModelDefault', e.target.value || undefined)}
                    className="w-full rounded-md border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-3 py-2 text-[var(--cb-text-primary)]"
                  >
                    <option value="">None</option>
                    <option value="saas">SaaS</option>
                    <option value="priceVolume">Price×Volume</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="runwayWarning" className="text-[var(--cb-text-primary)]">Runway Warning (Months)</Label>
                  <Input
                    id="runwayWarning"
                    type="number"
                    min="1"
                    max="36"
                    value={settings.defaults.operating.runwayWarningMonths || ''}
                    onChange={(e) => updateSettings('defaults.operating.runwayWarningMonths', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
              </div>
            </div>

            {/* Global Defaults */}
            <div className="space-y-4 border-l-2 border-[var(--cb-border-subtle)] pl-4">
              <h3 className="font-semibold text-[var(--cb-text-primary)]">Global</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="currency" className="text-[var(--cb-text-primary)]">Currency</Label>
                  <select
                    id="currency"
                    value={settings.defaults.global.currency}
                    onChange={(e) => updateSettings('defaults.global.currency', e.target.value)}
                    className="w-full rounded-md border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-3 py-2 text-[var(--cb-text-primary)]"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="decimals" className="text-[var(--cb-text-primary)]">Decimal Places</Label>
                  <select
                    id="decimals"
                    value={settings.defaults.global.decimals.toString()}
                    onChange={(e) => updateSettings('defaults.global.decimals', parseInt(e.target.value) as 0 | 1 | 2)}
                    className="w-full rounded-md border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-3 py-2 text-[var(--cb-text-primary)]"
                  >
                    <option value="0">0</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                  </select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Guardrails */}
        <Card className="border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
          <CardHeader>
            <CardTitle className="text-[var(--cb-text-primary)]">Guardrails</CardTitle>
            <CardDescription>Warnings and blocks for model outputs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h3 className="font-semibold text-[var(--cb-text-primary)]">Global Action</h3>
              <select
                value={settings.guardrails.global.action}
                onChange={(e) => updateSettings('guardrails.global.action', e.target.value)}
                className="w-full rounded-md border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-3 py-2 text-[var(--cb-text-primary)]"
              >
                <option value="warn">Warn</option>
                <option value="block">Block</option>
              </select>
            </div>

            {/* LBO Guardrails */}
            <div className="space-y-4 border-l-2 border-[var(--cb-border-subtle)] pl-4">
              <h3 className="font-semibold text-[var(--cb-text-primary)]">LBO</h3>
              <p className="text-xs text-[var(--cb-text-muted)]">
                Not used in LBO yet (DCF / v2 feature)
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="maxIRR" className="text-[var(--cb-text-primary)]">Max IRR (%)</Label>
                  <Input
                    id="maxIRR"
                    type="number"
                    step="0.1"
                    min="0"
                    value={settings.guardrails.lbo.maxIRR ? settings.guardrails.lbo.maxIRR * 100 : ''}
                    onChange={(e) => updateSettings('guardrails.lbo.maxIRR', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                    disabled
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxLeverage" className="text-[var(--cb-text-primary)]">Max Leverage (x)</Label>
                  <Input
                    id="maxLeverage"
                    type="number"
                    step="0.1"
                    min="0"
                    value={settings.guardrails.lbo.maxLeverage || ''}
                    onChange={(e) => updateSettings('guardrails.lbo.maxLeverage', e.target.value ? parseFloat(e.target.value) : undefined)}
                    disabled
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
              </div>
            </div>

            {/* Merger Guardrails */}
            <div className="space-y-4 border-l-2 border-[var(--cb-border-subtle)] pl-4">
              <h3 className="font-semibold text-[var(--cb-text-primary)]">Merger</h3>
              <div className="space-y-2">
                <Label htmlFor="maxDilution" className="text-[var(--cb-text-primary)]">Max Dilution (%)</Label>
                <Input
                  id="maxDilution"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={settings.guardrails.merger.maxDilutionPct ? settings.guardrails.merger.maxDilutionPct * 100 : ''}
                  onChange={(e) => updateSettings('guardrails.merger.maxDilutionPct', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                  className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                />
              </div>
            </div>

            {/* Operating Guardrails */}
            <div className="space-y-4 border-l-2 border-[var(--cb-border-subtle)] pl-4">
              <h3 className="font-semibold text-[var(--cb-text-primary)]">Operating</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="runwayThreshold" className="text-[var(--cb-text-primary)]">Runway Threshold (Months)</Label>
                  <Input
                    id="runwayThreshold"
                    type="number"
                    min="1"
                    max="36"
                    value={settings.guardrails.operating.runwayBelowMonths?.months || ''}
                    onChange={(e) => updateSettings('guardrails.operating.runwayBelowMonths', e.target.value ? {
                      months: parseInt(e.target.value),
                      action: settings.guardrails.operating.runwayBelowMonths?.action || 'warn',
                    } : undefined)}
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="runwayAction" className="text-[var(--cb-text-primary)]">Runway Action</Label>
                  <select
                    id="runwayAction"
                    value={settings.guardrails.operating.runwayBelowMonths?.action || 'warn'}
                    onChange={(e) => updateSettings('guardrails.operating.runwayBelowMonths', settings.guardrails.operating.runwayBelowMonths ? {
                      ...settings.guardrails.operating.runwayBelowMonths,
                      action: e.target.value,
                    } : undefined)}
                    className="w-full rounded-md border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-3 py-2 text-[var(--cb-text-primary)]"
                  >
                    <option value="warn">Warn</option>
                    <option value="block">Block</option>
                  </select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Preferences */}
        <Card className="border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
          <CardHeader>
            <CardTitle className="text-[var(--cb-text-primary)]">Data Preferences</CardTitle>
            <CardDescription>Configure data fetching behavior</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="primarySource" className="text-[var(--cb-text-primary)]">Primary Data Source</Label>
              <select
                id="primarySource"
                value={settings.data.primarySource}
                onChange={(e) => updateSettings('data.primarySource', e.target.value)}
                className="w-full rounded-md border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-3 py-2 text-[var(--cb-text-primary)]"
              >
                <option value="polygon">Polygon</option>
                <option value="fmp">FMP</option>
                <option value="alphavantage">Alpha Vantage</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fallbackStrategy" className="text-[var(--cb-text-primary)]">Fallback Strategy</Label>
              <select
                id="fallbackStrategy"
                value={settings.data.fallbackStrategy}
                onChange={(e) => updateSettings('data.fallbackStrategy', e.target.value)}
                className="w-full rounded-md border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-3 py-2 text-[var(--cb-text-primary)]"
              >
                <option value="fail">Fail (no silent fallback)</option>
                <option value="prompt">Prompt user</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Reporting */}
        <Card className="border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
          <CardHeader>
            <CardTitle className="text-[var(--cb-text-primary)]">Reporting</CardTitle>
            <CardDescription>Report and Excel output preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="verbosity" className="text-[var(--cb-text-primary)]">Report Verbosity</Label>
              <select
                id="verbosity"
                value={settings.reporting.verbosity}
                onChange={(e) => updateSettings('reporting.verbosity', e.target.value)}
                className="w-full rounded-md border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-3 py-2 text-[var(--cb-text-primary)]"
              >
                <option value="summary">Summary</option>
                <option value="full">Full</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="excelStyle" className="text-[var(--cb-text-primary)]">Excel Style</Label>
              <select
                id="excelStyle"
                value={settings.reporting.excelStyle}
                onChange={(e) => updateSettings('reporting.excelStyle', e.target.value)}
                className="w-full rounded-md border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-3 py-2 text-[var(--cb-text-primary)]"
              >
                <option value="compact">Compact</option>
                <option value="presentation">Presentation</option>
              </select>
            </div>
          </CardContent>
        </Card>

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
