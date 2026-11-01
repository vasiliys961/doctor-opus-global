export interface RagEvidence {
  evidence: string;
  drugs: string[];
  retrieved: boolean;
  hits: Array<{ id: string; title: string; section: string; sourceUrl: string; similarity: number }>;
}
export declare function medicationEvidence(
  caseText: string,
  indexPath: string,
  options?: { limit?: number; maxChars?: number; embedQuery?: (query: string) => Promise<Float32Array> }
): Promise<RagEvidence>;
