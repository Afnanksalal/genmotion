export type Energy = 'restrained' | 'balanced' | 'energetic' | 'cinematic';

export interface MotionRecipe {
  id: string;
  title: string;
  roles: string[];
  energy: Energy[];
  signature: string;
  duration: [number, number];
  properties: Array<'x' | 'y' | 'scale' | 'rotation' | 'opacity' | 'blur' | 'progress' | 'reveal'>;
  incompatibleWith: string[];
  cost: 1 | 2 | 3 | 4 | 5;
  accessibility: string[];
}

export interface TasteReference {
  id: string;
  title: string;
  family: string;
  roles: string[];
  energy: Energy;
  composition: string[];
  hierarchy: string[];
  motion: string[];
  pacing: string[];
  typography: string[];
  surface: string[];
  borrow: string[];
  avoid: string[];
  transform: string[];
  keywords: string[];
  provenance: string;
  license: string;
}

export interface SceneBlueprint {
  id: string;
  title: string;
  roles: string[];
  energy: Energy;
  duration: [number, number];
  phases: Array<{ name: string; range: [number, number]; purpose: string; recipes: string[] }>;
  slots: string[];
  signatureMove: string;
  constraints: string[];
}
