export interface TearSheet {
  ticker: string;
  companyName: string;
  sections: TearSheetSection[];
}

export interface TearSheetSection {
  title: string;
  content: string | Record<string, any>;
}
