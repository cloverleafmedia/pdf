import {
  Merge, Stethoscope, Scissors, ScanText, Stamp, PenTool, Rows3, Archive, FileDown, QrCode,
  Crop, Package2, SplitSquareHorizontal, BookmarkPlus, Download, Upload, ShieldCheck, BadgeCheck,
  FileSpreadsheet, FileCheck2, Accessibility, Library, Lock, Images, Table2, ClipboardList, Award,
  Highlighter, Underline, Strikethrough, StickyNote, Type, Pen, Eraser,
  Moon, Presentation, Layers, Search,
} from 'lucide-react'

// Single source of truth for the three already array-based tool groups, so
// Toolbar.jsx's flyout menus and CommandPalette.jsx's fuzzy-searchable
// command list can't drift apart - which they repeatedly did across v1.8.0/
// v1.8.1 (every new feature needed a matching entry added by hand in both
// files). Everything else in the toolbar (Datei/Navigation/Zoom/Sonstiges,
// plus the non-array tool-mode buttons like hand/select/redact/form/newfield/
// shape) stays defined directly in each component, since Toolbar.jsx itself
// never had an array for those to derive from, and no duplication bug was
// ever observed there.
//
// `heading` entries are pure section markers for Toolbar.jsx's flyout (no id,
// so they can never collide with pinnedTools); CommandPalette.jsx filters
// them out and keeps its own coarser group label instead.

export function buildDocumentItems({
  t, pdfDoc, openSplit, openOCR, openWatermark, openSignature, openHeaderFooter, openCompress,
  openExportImages, openQRCode, openCrop, openBatch, openCompare, openSanitize, openSignatureVerify,
  openMailMerge, openPdfa, openA11y, openLibrary, openEncrypt, openImagesToPdf, openTableExtract,
  openCommentsSummary, openStamp,
}) {
  return [
    { heading: 'Seiten & Zusammenführen' },
    { id: 'merge',    icon: <Merge size={15}/>,    label: t('toolbar.merge'), onClick: () => window._mergePDF?.(), disabled: !pdfDoc },
    { id: 'repair',   icon: <Stethoscope size={15}/>, label: 'PDF reparieren', onClick: () => window._repairPDF?.(), disabled: !pdfDoc },
    { id: 'split',    icon: <Scissors size={15}/>,  label: t('toolbar.split'), onClick: openSplit, disabled: !pdfDoc },
    { id: 'crop',     icon: <Crop size={15}/>,      label: 'Seite beschneiden', onClick: openCrop, disabled: !pdfDoc },
    { id: 'batch',    icon: <Package2 size={15}/>,  label: 'Batch-Verarbeitung', onClick: openBatch },
    { id: 'compare',  icon: <SplitSquareHorizontal size={15}/>, label: 'PDFs vergleichen', onClick: openCompare, disabled: !pdfDoc },

    { heading: 'Schützen & Kennzeichnen' },
    { id: 'watermark',    icon: <Stamp size={15}/>,      label: 'Wasserzeichen', onClick: openWatermark, disabled: !pdfDoc },
    { id: 'signature',    icon: <PenTool size={15}/>,    label: 'Unterschrift', onClick: openSignature, disabled: !pdfDoc },
    { id: 'headerfooter', icon: <Rows3 size={15}/>,      label: 'Kopf- & Fußzeile', onClick: openHeaderFooter, disabled: !pdfDoc },
    { id: 'stamp',        icon: <Award size={15}/>,      label: 'Stempel', onClick: openStamp, disabled: !pdfDoc },
    { id: 'qrcode',       icon: <QrCode size={15}/>,     label: 'QR-Code einfügen', onClick: openQRCode, disabled: !pdfDoc },
    { id: 'encrypt',      icon: <Lock size={15}/>,       label: 'Verschlüsseln', onClick: openEncrypt, disabled: !pdfDoc },
    { id: 'sanitize',     icon: <ShieldCheck size={15}/>, label: 'Dokument bereinigen', onClick: openSanitize, disabled: !pdfDoc },
    { id: 'verifysig',    icon: <BadgeCheck size={15}/>, label: 'Signatur prüfen', onClick: openSignatureVerify, disabled: !pdfDoc },

    { heading: 'Konvertieren & Prüfen' },
    { id: 'ocr',          icon: <ScanText size={15}/>,   label: 'OCR', onClick: openOCR, disabled: !pdfDoc },
    { id: 'compress',     icon: <Archive size={15}/>,    label: 'Komprimieren', onClick: openCompress, disabled: !pdfDoc },
    { id: 'exportimg',    icon: <FileDown size={15}/>,   label: 'Als Bilder exportieren', onClick: openExportImages, disabled: !pdfDoc },
    { id: 'tableextract', icon: <Table2 size={15}/>,     label: 'Tabellen als CSV exportieren', onClick: openTableExtract, disabled: !pdfDoc },
    { id: 'imagestopdf',  icon: <Images size={15}/>,     label: 'Bilder zu PDF', onClick: openImagesToPdf },
    { id: 'pdfa',         icon: <FileCheck2 size={15}/>, label: 'PDF/A-Export', onClick: openPdfa, disabled: !pdfDoc },
    { id: 'a11y',         icon: <Accessibility size={15}/>, label: 'Barrierefreiheits-Check', onClick: openA11y, disabled: !pdfDoc },

    { heading: 'Anmerkungen' },
    { id: 'exportannot',    icon: <BookmarkPlus size={15}/>,   label: 'Anmerkungen exportieren', onClick: () => window._exportAnnotations?.(), disabled: !pdfDoc },
    { id: 'exportxfdf',     icon: <Download size={15}/>,       label: 'Anmerkungen als XFDF exportieren', onClick: () => window._exportAnnotationsXFDF?.(), disabled: !pdfDoc },
    { id: 'importxfdf',     icon: <Upload size={15}/>,         label: 'Anmerkungen aus XFDF importieren', onClick: () => window._importAnnotationsXFDF?.(), disabled: !pdfDoc },
    { id: 'commentssummary', icon: <ClipboardList size={15}/>, label: 'Kommentar-Zusammenfassung', onClick: openCommentsSummary, disabled: !pdfDoc },

    { heading: 'Verwaltung' },
    { id: 'library',   icon: <Library size={15}/>,         label: 'Bibliothek', onClick: openLibrary },
    { id: 'mailmerge', icon: <FileSpreadsheet size={15}/>, label: 'Serienbrief', onClick: openMailMerge },
  ]
}

export function buildAnnotateItems({ t }) {
  return [
    { id: 'highlight',     icon: <Highlighter size={15}/>,   label: t('toolbar.highlight') },
    { id: 'underline',     icon: <Underline size={15}/>,     label: t('toolbar.underline') },
    { id: 'strikethrough', icon: <Strikethrough size={15}/>, label: t('toolbar.strikethrough') },
    { id: 'note',          icon: <StickyNote size={15}/>,    label: t('toolbar.note') },
    { id: 'text',          icon: <Type size={15}/>,          label: t('toolbar.textBox') },
    { id: 'draw',          icon: <Pen size={15}/>,           label: t('toolbar.draw') },
    { id: 'eraser',        icon: <Eraser size={15}/>,        label: t('toolbar.eraser') },
  ]
}

export function buildViewItems({ nightMode, twoPageView, magnifierActive, toggleNightMode, setTwoPageView, toggleMagnifier, togglePresentation }) {
  return [
    { id: 'night',        icon: <Moon size={15}/>,         label: 'Nachtmodus',          toggled: nightMode,       onClick: toggleNightMode },
    { id: 'presentation', icon: <Presentation size={15}/>, label: 'Präsentation (F5)',   toggled: false,           onClick: togglePresentation },
    { id: 'twopage',      icon: <Layers size={15}/>,       label: 'Zwei-Seiten-Ansicht', toggled: twoPageView,     onClick: () => setTwoPageView(!twoPageView) },
    { id: 'magnifier',    icon: <Search size={15}/>,       label: 'Lupe',                toggled: magnifierActive, onClick: toggleMagnifier },
  ]
}
