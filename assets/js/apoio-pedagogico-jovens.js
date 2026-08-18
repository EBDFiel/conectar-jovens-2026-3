(() => {
  'use strict';

  const PRINT_PRESETS = [
    'apoio-print-spacious',
    'apoio-print-balanced',
    'apoio-print-compact',
    'apoio-print-tight'
  ];

  const PAGE_CONTENT_HEIGHT_MM = 278; // A4 (297mm) menos margens verticais de 9mm + 10mm.
  const PAGE_CONTENT_WIDTH_MM = 192;  // A4 (210mm) menos margens laterais de 9mm + 9mm.
  const LAST_PAGE_OPTIMIZE_THRESHOLD = 0.56;

  const originalDocumentTitle = document.title;
  let printOptimizationPromise = null;

  const getLessonNumber = () => {
    const sources = [
      document.querySelector('.hero-titulo span')?.textContent,
      document.querySelector('.hero-titulo h1')?.textContent,
      document.title,
      window.location.pathname
    ].filter(Boolean);

    for (const source of sources) {
      const text = String(source);
      const match = text.match(/li(?:ç|c)[aã]o[\s_-]*0?(\d{1,2})/i)
        || text.match(/licao-(\d{1,2})(?:-|\.|\/|$)/i);
      if (match) return String(Number(match[1]));
    }
    return '';
  };

  const getPrintDocumentTitle = () => {
    const lessonNumber = getLessonNumber();
    return lessonNumber
      ? `Apoio Pedagógico Lição ${lessonNumber} Jovens`
      : 'Apoio Pedagógico Jovens';
  };

  const preparePrintTitle = () => {
    document.title = getPrintDocumentTitle();
  };

  const restoreDocumentTitle = () => {
    document.title = originalDocumentTitle;
  };

  const applyPrintPreset = preset => {
    PRINT_PRESETS.forEach(className => document.body.classList.remove(className));
    document.body.classList.add(preset || 'apoio-print-balanced');
  };

  const collectPrintableCss = () => {
    const chunks = [];
    [...document.styleSheets].forEach(sheet => {
      try {
        [...sheet.cssRules].forEach(rule => chunks.push(rule.cssText));
      } catch (error) {
        // Caso uma folha externa não possa ser lida, mede com as regras disponíveis.
      }
    });
    return chunks.join('\n').replace(/@media\s+print/gi, '@media all');
  };

  const waitForImages = doc => Promise.all(
    [...doc.images].map(image => {
      if (image.complete) return Promise.resolve();
      return new Promise(resolve => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
    })
  );

  const printableMarkup = () => {
    const selectors = ['.cabecalho-site', '.pagina-apoio', '.rodape-social'];
    return selectors
      .map(selector => document.querySelector(selector)?.outerHTML || '')
      .join('');
  };

  const measurePrintPresets = async () => {
    const markup = printableMarkup();
    if (!markup) return null;

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_CONTENT_WIDTH_MM}mm;height:500px;visibility:hidden;pointer-events:none;border:0;`;
    document.body.appendChild(iframe);

    try {
      const cssText = collectPrintableCss();
      const bodyClasses = [...document.body.classList].filter(className => !PRINT_PRESETS.includes(className));
      const doc = iframe.contentDocument;
      doc.open();
      doc.write(`<!doctype html><html><head><meta charset="utf-8"><base href="${document.baseURI}"><style>${cssText}</style></head><body class="${bodyClasses.join(' ')}">${markup}<div id="apoio-page-ruler" style="position:absolute;visibility:hidden;width:1px;height:${PAGE_CONTENT_HEIGHT_MM}mm"></div></body></html>`);
      doc.close();

      await waitForImages(doc);
      if (doc.fonts?.ready) await doc.fonts.ready.catch(() => {});

      const ruler = doc.getElementById('apoio-page-ruler');
      const pageHeight = ruler?.getBoundingClientRect().height || (PAGE_CONTENT_HEIGHT_MM * 96 / 25.4);
      const metrics = {};

      for (const preset of PRINT_PRESETS) {
        PRINT_PRESETS.forEach(className => doc.body.classList.remove(className));
        doc.body.classList.add(preset);
        await new Promise(resolve => iframe.contentWindow.requestAnimationFrame(
          () => iframe.contentWindow.requestAnimationFrame(resolve)
        ));

        const totalHeight = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
        const pages = Math.max(1, Math.ceil((totalHeight - 2) / pageHeight));
        const lastPageHeight = totalHeight - ((pages - 1) * pageHeight);
        const lastPageRatio = Math.max(0, Math.min(1, lastPageHeight / pageHeight));
        metrics[preset] = { totalHeight, pageHeight, pages, lastPageRatio };
      }

      return metrics;
    } finally {
      iframe.remove();
    }
  };

  const choosePrintPreset = metrics => {
    if (!metrics) return 'apoio-print-balanced';

    const balanced = metrics['apoio-print-balanced'];
    if (!balanced) return 'apoio-print-balanced';

    // Se a última folha ficaria pouco aproveitada, tenta eliminar essa folha.
    // Só compacta quando a medição indica redução real da quantidade de páginas.
    if (balanced.pages > 1 && balanced.lastPageRatio < LAST_PAGE_OPTIMIZE_THRESHOLD) {
      const targetPages = balanced.pages - 1;
      const candidates = ['apoio-print-compact', 'apoio-print-tight'].filter(preset => {
        const metric = metrics[preset];
        return metric
          && metric.pages <= targetPages
          && metric.totalHeight <= (targetPages * metric.pageHeight * 0.994);
      });
      if (candidates.length) return candidates[0];
    }

    // Se houver folga, prioriza uma fonte um pouco maior sem criar nova folha.
    const spacious = metrics['apoio-print-spacious'];
    if (spacious && spacious.pages === balanced.pages && spacious.lastPageRatio >= 0.16) {
      return 'apoio-print-spacious';
    }

    return 'apoio-print-balanced';
  };

  const optimizePrintLayout = async () => {
    try {
      const metrics = await measurePrintPresets();
      const preset = choosePrintPreset(metrics);
      applyPrintPreset(preset);
      return preset;
    } catch (error) {
      applyPrintPreset('apoio-print-balanced');
      return 'apoio-print-balanced';
    }
  };

  applyPrintPreset('apoio-print-balanced');
  printOptimizationPromise = optimizePrintLayout();

  window.addEventListener('beforeprint', () => {
    preparePrintTitle();
    if (!PRINT_PRESETS.some(className => document.body.classList.contains(className))) {
      applyPrintPreset('apoio-print-balanced');
    }
  });

  window.addEventListener('afterprint', restoreDocumentTitle);

  document.addEventListener('click', async event => {
    const printButton = event.target.closest('[data-print-jovens], .btn-imprimir');
    if (!printButton) return;

    event.preventDefault();
    printButton.disabled = true;
    printButton.setAttribute('aria-busy', 'true');

    try {
      preparePrintTitle();
      if (!printOptimizationPromise) printOptimizationPromise = optimizePrintLayout();
      await printOptimizationPromise;
      window.print();
    } finally {
      printButton.disabled = false;
      printButton.removeAttribute('aria-busy');
    }
  });
})();
