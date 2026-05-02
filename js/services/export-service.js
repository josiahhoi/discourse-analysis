/**
 * Discourse Analysis Export Service
 * Handles PNG, PDF, and SVG exports.
 */

const DA_EXPORT = {
  /**
   * Helper to build a clean JSON representation of the current state.
   */
  buildBracketData() {
    return {
      version: 1,
      passageRef: DA_STATE.passageRef,
      propositions: DA_STATE.propositions,
      verseRefs: DA_STATE.verseRefs,
      brackets: DA_STATE.brackets.map((a) => ({ ...a })),
      formatTags: DA_STATE.formatTags.map((t) => ({ ...t })),
      wordArrows: DA_STATE.wordArrows.map((w) => ({ ...w })),
      comments: DA_STATE.comments.map((c) => ({ ...c })),
      copyrightLabel: document.getElementById('copyrightLabel')?.textContent || '',
      pageAuthor: (document.getElementById('pageAuthor')?.value || '').trim(),
      activeProjectId: DA_STATE.activeProjectId || null,
      customLabels: (DA_STATE.customLabels || []).map(cl => ({ ...cl })),
      exportedAt: new Date().toISOString(),
    };
  },

  /**
   * Applies specific styles to the cloned document during html2canvas capture.
   */
  applyExportCloneStyles(clonedDoc) {
    const clonedWorkspace = clonedDoc.getElementById('workspace');
    if (clonedWorkspace) {
      clonedWorkspace.style.transform = 'none';
      clonedWorkspace.style.width = 'auto';
      clonedWorkspace.style.height = 'auto';
      clonedWorkspace.style.padding = '40px';
      clonedWorkspace.style.background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#fdfaf3';
      
      // Hide UI toolbars and buttons in export
      clonedDoc.querySelectorAll(`
        .workspace-toolbar, 
        .sidebar-toggle-btn, 
        .cloud-sync-btn, 
        .proposition-controls, 
        .proposition-handle, 
        .connection-node, 
        .bracket-hitbox, 
        .bracket-comment-icon
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
    const scrollX = workspace.scrollLeft || document.getElementById('workspace')?.scrollLeft || 0;
    const scrollY = workspace.scrollTop || document.getElementById('workspace')?.scrollTop || 0;

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
      scale: 2,
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#fdfaf3',
      logging: false,
      onclone: this.applyExportCloneStyles.bind(this)
    };

    if (found) {
      options.x = (minX - workspaceRect.left) - padding;
      options.y = (minY - workspaceRect.top) - padding;
      options.width = (maxX - minX) + (padding * 2);
      options.height = (maxY - minY) + (padding * 2);
      
      if (options.x < 0) {
          options.width += Math.abs(options.x);
          options.x = 0;
      }
    }

    return options;
  },

  /**
   * Captures the diagram as a PNG and copies it to the clipboard.
   */
  async copyDiagramToClipboard() {
    const workspace = document.getElementById('workspace');
    if (!workspace) return;

    DA_UI.showStatus('Capturing diagram...', 'info');

    // Save current states and expand all for export
    const prevShowComments = DA_STATE.showCommentsEnabled;
    const savedCollapseStates = DA_STATE.brackets.map(b => b.isCollapsed);
    
    DA_STATE.showCommentsEnabled = false;
    DA_STATE.brackets.forEach(b => b.isCollapsed = false);
    
    if (window.renderAll) window.renderAll();

    // Wait for DOM to settle
    await new Promise(r => requestAnimationFrame(r));

    try {
      const options = await this.getCaptureOptions(workspace);
      const canvas = await html2canvas(workspace, options);
      
      // Restore original states
      DA_STATE.showCommentsEnabled = prevShowComments;
      DA_STATE.brackets.forEach((b, i) => b.isCollapsed = savedCollapseStates[i]);
      if (window.renderAll) window.renderAll();

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
      if (window.renderAll) window.renderAll();
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
    
    const savedCollapseStates = DA_STATE.brackets.map(b => b.isCollapsed);
    DA_STATE.brackets.forEach(b => b.isCollapsed = false);
    if (window.renderAll) window.renderAll();
    await new Promise(r => requestAnimationFrame(r));

    try {
      const options = await this.getCaptureOptions(workspace);
      const canvas = await html2canvas(workspace, options);
      
      // Restore
      DA_STATE.brackets.forEach((b, i) => b.isCollapsed = savedCollapseStates[i]);
      if (window.renderAll) window.renderAll();

      const link = document.createElement('a');
      const filename = (DA_STATE.passageRef || 'discourse').replace(/\s+/g, '_');
      link.download = `${filename}_${new Date().toISOString().slice(0,10)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      
      DA_UI.showStatus('Image saved.', 'success');
    } catch (err) {
      console.error(err);
      DA_STATE.brackets.forEach((b, i) => b.isCollapsed = savedCollapseStates[i]);
      if (window.renderAll) window.renderAll();
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
    
    const savedCollapseStates = DA_STATE.brackets.map(b => b.isCollapsed);
    DA_STATE.brackets.forEach(b => b.isCollapsed = false);
    if (window.renderAll) window.renderAll();
    await new Promise(r => requestAnimationFrame(r));

    try {
      const options = await this.getCaptureOptions(workspace);
      const canvas = await html2canvas(workspace, options);
      
      // Restore
      DA_STATE.brackets.forEach((b, i) => b.isCollapsed = savedCollapseStates[i]);
      if (window.renderAll) window.renderAll();

      const imgData = canvas.toDataURL('image/png');
      const { jsPDF } = jspdf;
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? 'l' : 'p',
        unit: 'px',
        format: [canvas.width / 2, canvas.height / 2]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2);

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
      if (window.renderAll) window.renderAll();
      DA_UI.showStatus('PDF export failed.', 'error');
    }
  }
};

window.DA_EXPORT = DA_EXPORT;
