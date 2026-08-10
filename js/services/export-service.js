/**
 * Discourse Analysis Export Service
 * Handles PNG, PDF, and SVG exports.
 */

// Captures rasterize at 2x CSS pixels so exported text stays sharp in print
// and when zoomed. Every conversion back to CSS pixels (notably the PDF page
// size) divides by this, so the two can't drift apart.
const CAPTURE_SCALE = 2;

const DA_EXPORT = {
  /**
   * Helper to build a clean JSON representation of the current state.
   */
  buildBracketData() {
    // Persist script/direction so Hebrew (RTL) and Greek projects survive a
    // save/load round-trip. Without these, reloading a saved Hebrew passage came
    // back left-to-right with the wrong font.
    const propsEl = document.getElementById('propositions');
    return {
      version: 3, // v3: structured verseBreaks; v2: stable bracket ids (see normalizeBracketData)
      passageRef: DA_STATE.passageRef,
      isRTL: !!DA_STATE.isRTL,
      isHebrew: !!propsEl?.classList.contains('hebrew-text'),
      isGreek: !!propsEl?.classList.contains('greek-text'),
      propositions: DA_STATE.propositions,
      verseRefs: DA_STATE.verseRefs,
      verseBreaks: DA_STATE.verseBreaks.map((a) => (a || []).slice()),
      // Parallel column (second text column): per-row, aligned to propositions.
      parallelTexts: (DA_STATE.parallelTexts || []).slice(),
      parallelLabel: DA_STATE.parallelLabel || '',
      parallelHidden: !!DA_STATE.parallelHidden,
      brackets: DA_STATE.brackets.map((a) => ({ ...a })),
      formatTags: DA_STATE.formatTags.map((t) => ({ ...t })),
      wordArrows: DA_STATE.wordArrows.map((w) => ({ ...w })),
      comments: DA_STATE.comments.map((c) => ({
        ...c,
        target: c.target ? { ...c.target } : c.target,
        replies: c.replies ? c.replies.map(r => ({ ...r })) : []
      })),
      copyrightLabel: document.getElementById('copyrightLabel')?.textContent || '',
      pageAuthor: (document.getElementById('pageAuthor')?.value || '').trim(),
      activeProjectId: (window.DA_CLOUD && DA_CLOUD.getProjectId) ? DA_CLOUD.getProjectId() : (DA_STATE.activeProjectId || null),
      customLabels: (DA_STATE.customLabels || []).map(cl => ({ ...cl })),
      indentation: DA_STATE.indentation.slice(),
      bracketHighlights: Object.assign({}, DA_STATE.bracketHighlights),
      exportedAt: new Date().toISOString(),
    };
  },

  /**
   * Image/PDF capture works off the bracket view's DOM (proposition blocks and
   * the bracket SVG). When the block diagram view is active those elements are
   * hidden (display:none), which would make the capture blank. Temporarily flip
   * back to the bracket view for the capture, returning whether a restore is
   * needed afterward.
   */
  enterBracketViewForCapture() {
    // Comments are reviewer notes, not diagram content: strip their
    // always-visible highlights (text marks + bracket glow) from every
    // capture. The caller's pre-capture renderAll picks this up.
    DA_STATE.suppressCommentVisuals = true;
    const wasBlock = !!(window.DA_BLOCK && DA_BLOCK.isActive());
    if (wasBlock) DA_BLOCK.setActive(false);
    return wasBlock;
  },

  restoreViewAfterCapture(wasBlock) {
    // The caller's post-capture renderAll ran while the flag was still set,
    // so one more render brings the comment highlights back.
    DA_STATE.suppressCommentVisuals = false;
    if (window.renderAll) window.renderAll();
    if (wasBlock && window.DA_BLOCK) DA_BLOCK.setActive(true);
  },

  /**
   * Zoom is an on-screen reading preference, not a document property — exports
   * should look the same regardless of what the user currently has it set to.
   * Temporarily force 100% for the capture (not persisted; { persist: false }
   * so this transient change never overwrites the user's real localStorage
   * preference), returning the level to restore afterward.
   */
  enterBaseZoomForCapture() {
    const prevZoom = DA_STATE.zoomLevel;
    if (prevZoom !== DA_CONSTANTS.ZOOM_DEFAULT && window.DA_UI && DA_UI.applyZoom) {
      DA_UI.applyZoom(DA_CONSTANTS.ZOOM_DEFAULT, { persist: false, rerender: false });
    }
    return prevZoom;
  },

  restoreZoomAfterCapture(prevZoom) {
    if (prevZoom !== DA_CONSTANTS.ZOOM_DEFAULT && window.DA_UI && DA_UI.applyZoom) {
      DA_UI.applyZoom(prevZoom, { persist: false, rerender: false });
    }
  },

  /**
   * Applies specific styles to the cloned document during html2canvas capture.
   */
  applyExportCloneStyles(clonedDoc) {
    const clonedWorkspace = clonedDoc.getElementById('workspace');
    if (clonedWorkspace) {
      clonedWorkspace.style.transform = 'none';
      // The live .workspace is a SCROLL CONTAINER (styles.css sets
      // overflow-x:auto, which forces overflow-y to compute to auto too), and
      // it's a `flex:1; min-width:0` child sized to the viewport. html2canvas
      // paints an element clipped to its own overflow box, so without the
      // three properties below the canvas comes out correctly sized to the
      // full content (getCaptureOptions measures that) but only the ON-SCREEN
      // portion is painted — the rest is blank background. That silently
      // cropped every diagram wider or taller than the window; Hebrew RTL plus
      // a parallel column overflows both axes badly enough to lose half the
      // page. `max-content` also stops the flex parent from re-imposing the
      // viewport width once overflow is visible.
      clonedWorkspace.style.overflow = 'visible';
      clonedWorkspace.style.flex = 'none';
      clonedWorkspace.style.width = 'max-content';
      clonedWorkspace.style.height = 'max-content';
      clonedWorkspace.style.padding = '40px';
      clonedWorkspace.style.background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#fdfaf3';
      
      // Hide UI toolbars and buttons in export
      clonedDoc.querySelectorAll(`
        .workspace-toolbar,
        .sidebar-toggle-btn,
        .cloud-sync-btn,
        .profile-indicator,
        .connection-node,
        .bracket-hitbox
      `).forEach(el => {
        el.style.display = 'none';
      });

      // Style the header for export
      const header = clonedDoc.getElementById('workspaceHeader');
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const textColor = isDark ? '#ffffff' : '#333333';
      const borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

      if (header) {
        header.style.padding = '0 0 1rem 0';
        header.style.borderBottom = `1px solid ${borderColor}`;
        header.style.marginBottom = '1.5rem';
        header.style.color = textColor;
      }

      // Ensure text is visible
      clonedDoc.querySelectorAll('.proposition-text, .bracket-label, .verse-ref').forEach(el => {
        el.style.color = textColor;
      });
    }
  },

  /**
   * Helper to calculate the full bounding box of all relevant content.
   */
  async getCaptureOptions(workspace) {
    const coreElements = [
      document.getElementById('workspaceHeader'),
      ...Array.from(workspace.querySelectorAll('.proposition-block')),
      ...Array.from(workspace.querySelectorAll('#bracketCanvas *')),
      ...Array.from(workspace.querySelectorAll('#wordArrowsSvg *'))
    ].filter(Boolean);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let found = false;

    const workspaceRect = workspace.getBoundingClientRect();
    const scrollX = workspace.scrollLeft || 0;
    const scrollY = workspace.scrollTop || 0;

    coreElements.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        minX = Math.min(minX, r.left + scrollX);
        minY = Math.min(minY, r.top + scrollY);
        maxX = Math.max(maxX, r.right + scrollX);
        maxY = Math.max(maxY, r.bottom + scrollY);
        found = true;
      }
    });

    const padding = 40;
    const options = {
      useCORS: true,
      scale: CAPTURE_SCALE,
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#fdfaf3',
      logging: false,
      onclone: this.applyExportCloneStyles.bind(this)
    };

    if (found) {
      // x/y are the capture window's offset from the workspace's border box.
      // Both go slightly negative whenever the content starts inside less
      // padding than we add here, and html2canvas handles that fine — it just
      // translates the window. (Clamping x to 0 while leaving y negative, as
      // this once did, kept the padding but widened the canvas by the clamped
      // amount, so exports came out with lopsided margins.)
      options.x = (minX - workspaceRect.left) - padding;
      options.y = (minY - workspaceRect.top) - padding;
      options.width = (maxX - minX) + (padding * 2);
      options.height = (maxY - minY) + (padding * 2);
    }

    return options;
  },

  /**
   * PDF page size, in points, for a capture canvas — the diagram's natural
   * size. Pure geometry (no DOM, no jsPDF) so it can be unit-tested.
   *
   * @param {{width: number, height: number}} canvas rasterized at CAPTURE_SCALE
   * @returns {{width: number, height: number}} page size in PDF points
   */
  getPdfPageSize(canvas) {
    const CSS_PX_TO_PT = 0.75;   // CSS px = 1/96in, PDF point = 1/72in
    const JSPDF_MAX_PT = 14400;  // jsPDF silently clamps the MediaBox at 200in
    let width = (canvas.width / CAPTURE_SCALE) * CSS_PX_TO_PT;
    let height = (canvas.height / CAPTURE_SCALE) * CSS_PX_TO_PT;
    // Past that clamp jsPDF keeps the page at 14400pt while addImage goes on
    // drawing at the requested size, so everything beyond the edge is simply
    // lost. Scale the page down to fit instead — a huge diagram then prints
    // small rather than cropped.
    const overflow = Math.max(width, height) / JSPDF_MAX_PT;
    if (overflow > 1) {
      width /= overflow;
      height /= overflow;
    }
    return { width, height };
  },

  /**
   * Captures the diagram as a PNG and copies it to the clipboard.
   */
  async copyDiagramToClipboard() {
    const workspace = document.getElementById('workspace');
    if (!workspace) return;

    DA_UI.showStatus('Capturing diagram...', 'info');

    const wasBlock = this.enterBracketViewForCapture();
    const prevZoom = this.enterBaseZoomForCapture();

    // Save current states and expand all for export (comment highlights are
    // already stripped by enterBracketViewForCapture above)
    const savedCollapseStates = DA_STATE.brackets.map(b => b.isCollapsed);

    DA_STATE.brackets.forEach(b => b.isCollapsed = false);

    if (window.renderAll) window.renderAll();

    // Wait for DOM to settle
    await new Promise(r => requestAnimationFrame(r));

    try {
      const options = await this.getCaptureOptions(workspace);
      const canvas = await html2canvas(workspace, options);

      // Restore original states
      DA_STATE.brackets.forEach((b, i) => b.isCollapsed = savedCollapseStates[i]);
      // Zoom FIRST, then render: applyZoom({ rerender: false }) re-applies the
      // CSS text scale immediately, so the renderAll below must run at the
      // restored zoom — otherwise the bracket geometry stays at the capture's
      // 100% positions under rescaled text (a visibly misaligned diagram).
      this.restoreZoomAfterCapture(prevZoom);
      if (window.renderAll) window.renderAll();
      this.restoreViewAfterCapture(wasBlock);

      const dataUrl = canvas.toDataURL('image/png');
      const bracketData = this.buildBracketData();
      const dnaString = JSON.stringify(bracketData);
      const compressedDna = typeof LZString !== 'undefined' ? LZString.compressToEncodedURIComponent(dnaString) : dnaString;

      const html = `
        <div style="font-family: sans-serif; background: white; padding: 10px;">
          <img src="${dataUrl}" alt="DISCOURSE_DNA:${compressedDna}" style="max-width: 100%; border: 1px solid #eee;" />
          <div style="display:none;">DISCOURSE_DNA:${compressedDna}</div>
        </div>
      `;

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const htmlBlob = new Blob([html], { type: 'text/html' });

      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blob,
          'text/html': htmlBlob
        })
      ]);

      DA_UI.showStatus('Diagram copied to clipboard!', 'success');
    } catch (err) {
      console.error('Export failed:', err);
      // Ensure restoration on failure
      DA_STATE.brackets.forEach((b, i) => b.isCollapsed = savedCollapseStates[i]);
      // Zoom FIRST, then render: applyZoom({ rerender: false }) re-applies the
      // CSS text scale immediately, so the renderAll below must run at the
      // restored zoom — otherwise the bracket geometry stays at the capture's
      // 100% positions under rescaled text (a visibly misaligned diagram).
      this.restoreZoomAfterCapture(prevZoom);
      if (window.renderAll) window.renderAll();
      this.restoreViewAfterCapture(wasBlock);
      DA_UI.showStatus('Capture failed.', 'error');
    }
  },

  /**
   * Saves the diagram as a PNG file.
   */
  async saveImageToFile() {
    const workspace = document.getElementById('workspace');
    if (!workspace) return;

    DA_UI.showStatus('Generating image...', 'info');

    const wasBlock = this.enterBracketViewForCapture();
    const prevZoom = this.enterBaseZoomForCapture();
    const savedCollapseStates = DA_STATE.brackets.map(b => b.isCollapsed);
    DA_STATE.brackets.forEach(b => b.isCollapsed = false);
    if (window.renderAll) window.renderAll();
    await new Promise(r => requestAnimationFrame(r));

    try {
      const options = await this.getCaptureOptions(workspace);
      const canvas = await html2canvas(workspace, options);

      // Restore
      DA_STATE.brackets.forEach((b, i) => b.isCollapsed = savedCollapseStates[i]);
      // Zoom FIRST, then render: applyZoom({ rerender: false }) re-applies the
      // CSS text scale immediately, so the renderAll below must run at the
      // restored zoom — otherwise the bracket geometry stays at the capture's
      // 100% positions under rescaled text (a visibly misaligned diagram).
      this.restoreZoomAfterCapture(prevZoom);
      if (window.renderAll) window.renderAll();
      this.restoreViewAfterCapture(wasBlock);

      const bracketData = this.buildBracketData();
      const rawBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const annotatedBlob = await DA_PERSISTENCE.injectPngMetadata(rawBlob, JSON.stringify(bracketData));
      const url = URL.createObjectURL(annotatedBlob);
      const link = document.createElement('a');
      const filename = (DA_STATE.passageRef || 'discourse').replace(/\s+/g, '_');
      link.download = `${filename}_${new Date().toISOString().slice(0,10)}.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);

      DA_UI.showStatus('Image saved.', 'success');
    } catch (err) {
      console.error(err);
      DA_STATE.brackets.forEach((b, i) => b.isCollapsed = savedCollapseStates[i]);
      // Zoom FIRST, then render: applyZoom({ rerender: false }) re-applies the
      // CSS text scale immediately, so the renderAll below must run at the
      // restored zoom — otherwise the bracket geometry stays at the capture's
      // 100% positions under rescaled text (a visibly misaligned diagram).
      this.restoreZoomAfterCapture(prevZoom);
      if (window.renderAll) window.renderAll();
      this.restoreViewAfterCapture(wasBlock);
      DA_UI.showStatus('Save failed.', 'error');
    }
  },

  /**
   * Exports the diagram as a PDF.
   */
  async exportToPDF() {
    if (typeof jspdf === 'undefined') {
      DA_UI.showStatus('PDF library not loaded.', 'error');
      return;
    }

    DA_UI.showStatus('Generating PDF...', 'info');
    const workspace = document.getElementById('workspace');

    const wasBlock = this.enterBracketViewForCapture();
    const prevZoom = this.enterBaseZoomForCapture();
    const savedCollapseStates = DA_STATE.brackets.map(b => b.isCollapsed);
    DA_STATE.brackets.forEach(b => b.isCollapsed = false);
    if (window.renderAll) window.renderAll();
    await new Promise(r => requestAnimationFrame(r));

    try {
      const options = await this.getCaptureOptions(workspace);
      const canvas = await html2canvas(workspace, options);

      // Restore
      DA_STATE.brackets.forEach((b, i) => b.isCollapsed = savedCollapseStates[i]);
      // Zoom FIRST, then render: applyZoom({ rerender: false }) re-applies the
      // CSS text scale immediately, so the renderAll below must run at the
      // restored zoom — otherwise the bracket geometry stays at the capture's
      // 100% positions under rescaled text (a visibly misaligned diagram).
      this.restoreZoomAfterCapture(prevZoom);
      if (window.renderAll) window.renderAll();
      this.restoreViewAfterCapture(wasBlock);

      const imgData = canvas.toDataURL('image/png');
      const { jsPDF } = jspdf;

      // One page at the diagram's natural size. The canvas is rasterized at 2x
      // (options.scale) for print sharpness, so its CSS-pixel size is half of
      // that; a CSS pixel is 1/96in and a PDF point 1/72in, hence 0.75 pt/px.
      // Using jsPDF's own 'px' unit instead writes a MediaBox 4/3x LARGER than
      // the pixel count, which turned an ordinary diagram into a ~33x30in
      // poster that print dialogs then tiled across hundreds of sheets.
      const pageDims = this.getPdfPageSize(canvas);

      const pdf = new jsPDF({
        orientation: pageDims.width > pageDims.height ? 'l' : 'p',
        unit: 'pt',
        format: [pageDims.width, pageDims.height]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, pageDims.width, pageDims.height);

      const bracketData = this.buildBracketData();
      const dnaString = JSON.stringify(bracketData);
      const compressedDna = typeof LZString !== 'undefined' ? LZString.compressToEncodedURIComponent(dnaString) : dnaString;
      const signature = 'BibleBracketDNA:' + compressedDna + '|||END';

      pdf.setProperties({
        title: DA_STATE.passageRef || 'Discourse Analysis',
        author: bracketData.pageAuthor || '',
        keywords: signature
      });

      const filename = (DA_STATE.passageRef || 'discourse').replace(/\s+/g, '_');
      pdf.save(`${filename}.pdf`);
      
      DA_UI.showStatus('PDF exported.', 'success');
    } catch (err) {
      console.error(err);
      DA_STATE.brackets.forEach((b, i) => b.isCollapsed = savedCollapseStates[i]);
      // Zoom FIRST, then render: applyZoom({ rerender: false }) re-applies the
      // CSS text scale immediately, so the renderAll below must run at the
      // restored zoom — otherwise the bracket geometry stays at the capture's
      // 100% positions under rescaled text (a visibly misaligned diagram).
      this.restoreZoomAfterCapture(prevZoom);
      if (window.renderAll) window.renderAll();
      this.restoreViewAfterCapture(wasBlock);
      DA_UI.showStatus('PDF export failed.', 'error');
    }
  }
};

window.DA_EXPORT = DA_EXPORT;
