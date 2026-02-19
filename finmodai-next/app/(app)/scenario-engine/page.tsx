import { ProductScenarioEngine } from '@/components/scenario/ProductScenarioEngine';

export default function ScenarioEnginePage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950 px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <ProductScenarioEngine />
      </div>
    </main>
  );
}
