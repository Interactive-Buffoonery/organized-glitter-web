import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '../../src/components/ui/dialog';
import '../../src/index.css';

const params = new URLSearchParams(location.search);
const layout = (params.get('layout') || 'centered') as
  'centered' | 'keyboard-safe' | 'keyboard-safe-sheet';
createRoot(document.getElementById('root')!).render(
  <Dialog>
    <DialogTrigger asChild>
      <button type="button">Edit test page</button>
    </DialogTrigger>
    <DialogContent layout={layout} motion={params.get('motion') === 'fade' ? 'fade' : 'default'}>
      <DialogTitle>Edit test page</DialogTitle>
      <DialogDescription>Shared dialog motion and keyboard verification.</DialogDescription>
      <label>
        Title
        <input aria-label="Title" defaultValue="Test page" />
      </label>
      <div className="max-h-40 overflow-y-auto">
        <div style={{ height: 400 }}>Scrollable test content</div>
      </div>
    </DialogContent>
  </Dialog>
);
