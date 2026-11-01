declare module 'mammoth' {
  export interface MammothResult {
    value: string;
    messages: Array<{
      type: 'warning' | 'error';
      message: string;
    }>;
  }

  export function convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>;
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>;
}
