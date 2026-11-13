import React from 'react';
import { createRoot } from 'react-dom/client';
import { Drawer as DrawerPrimitive } from 'vaul';
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from '../../src/components/ui/drawer';
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
const NestedDialog = () => (
  <Dialog>
    <DialogTrigger asChild>
      <button type="button">Open inner dialog</button>
    </DialogTrigger>
    <DialogContent>
      <DialogTitle>Inner dialog</DialogTitle>
      <DialogDescription>Nested focus verification.</DialogDescription>
      <input aria-label="Inner value" />
    </DialogContent>
  </Dialog>
);

const NestedFixture = () => (
  <>
    <button type="button">Outside control</button>
    {params.get('parent') === 'drawer' ? (
      <Drawer>
        <DrawerPrimitive.Trigger asChild>
          <button type="button">Open outer dialog</button>
        </DrawerPrimitive.Trigger>
        <DrawerContent>
          <DrawerTitle>Outer dialog</DrawerTitle>
          <DrawerDescription>Nested dialog focus through Vaul.</DrawerDescription>
          <input aria-label="Outer value" />
          <NestedDialog />
          <DrawerPrimitive.Close asChild>
            <button type="button">Close outer dialog</button>
          </DrawerPrimitive.Close>
        </DrawerContent>
      </Drawer>
    ) : (
      <Dialog>
        <DialogTrigger asChild>
          <button type="button">Open outer dialog</button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Outer dialog</DialogTitle>
          <DialogDescription>Shared dialog nesting verification.</DialogDescription>
          <input aria-label="Outer value" />
          <NestedDialog />
        </DialogContent>
      </Dialog>
    )}
  </>
);

createRoot(document.getElementById('root')!).render(
  params.has('nested') ? (
    <NestedFixture />
  ) : (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button">Edit test page</button>
      </DialogTrigger>
      <DialogContent layout={layout}>
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
  )
);
