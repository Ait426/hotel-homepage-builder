"use client";

import { Component, Suspense, type ReactNode } from "react";

/**
 * Per-section error isolation. Sections that fetch data (e.g. RoomsShowcase
 * hits the data source) can throw at render time — a DB blip, a bad row,
 * an upstream timeout. Without a boundary, one such failure rejects the
 * whole page's render and 500s an otherwise-fine tenant site. This client
 * boundary contains the blast radius to the single failing section (it
 * renders nothing in its place) and logs the cause server-side, mirroring
 * how SectionRenderer already fail-soft-skips unknown/invalid sections.
 *
 * The <Suspense> lets an async section stream in on its own without blocking
 * its siblings, and pairs with the boundary so a rejected render is caught
 * here rather than bubbling to the page.
 */

interface Props {
  children: ReactNode;
  sectionType: string;
  sectionId: string;
  hotelSlug: string;
}

interface State {
  hasError: boolean;
}

export class SectionBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn(
      `[sections] "${this.props.sectionType}" (id=${this.props.sectionId}, hotel=${this.props.hotelSlug}) threw during render — skipped:`,
      error instanceof Error ? error.message : error,
    );
  }

  render() {
    if (this.state.hasError) return null;
    return <Suspense fallback={null}>{this.props.children}</Suspense>;
  }
}
