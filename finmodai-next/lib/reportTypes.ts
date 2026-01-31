export interface ModelReport {
  id: string;
  modelId: string;
  modelType: string;
  ticker: string;
  title: string;
  content: string;
  format: 'markdown' | 'html' | 'pdf';
  createdAt: string;
}
