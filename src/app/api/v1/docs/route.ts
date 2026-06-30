export async function GET(_req: Request): Promise<Response> {
  const specUrl = "/api/v1/openapi.json";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OptSolv Time Tracker — Documentação da API v1</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&family=Sora:wght@100..800&display=swap" rel="stylesheet" />
    <style>
      /* ─── Design Tokens & Themes ───────────────────────────────────────── */
      :root {
        --bg-primary: #ffffff;
        --bg-secondary: #f8f9fa;
        --bg-tertiary: #f1f3f5;
        --text-primary: #212529;
        --text-secondary: #495057;
        --text-tertiary: #868e96;
        --border-color: #dee2e6;
        --border-subtle: #e9ecef;
        --brand-color: #f97316;
        --brand-hover: #ea580c;
        --brand-bg: rgba(249, 115, 22, 0.06);
        --card-bg: #ffffff;
        --card-border: #e9ecef;
        --code-bg: #1e1e1e;
        --code-text: #f8f9fa;
        --filter-invert: 0;
        --shadow-color: rgba(0, 0, 0, 0.06);
        
        --method-get-bg: rgba(59, 130, 246, 0.05);
        --method-get-border: rgba(59, 130, 246, 0.2);
        --method-get-text: #2563eb;
        
        --method-post-bg: rgba(34, 197, 94, 0.05);
        --method-post-border: rgba(34, 197, 94, 0.2);
        --method-post-text: #16a34a;
        
        --method-put-bg: rgba(234, 179, 8, 0.05);
        --method-put-border: rgba(234, 179, 8, 0.2);
        --method-put-text: #ca8a04;
        
        --method-delete-bg: rgba(239, 68, 68, 0.05);
        --method-delete-border: rgba(239, 68, 68, 0.2);
        --method-delete-text: #dc2626;
      }

      html.dark {
        --bg-primary: #0a0a0a;
        --bg-secondary: #171717;
        --bg-tertiary: #262626;
        --text-primary: #f5f5f5;
        --text-secondary: #a3a3a3;
        --text-tertiary: #737373;
        --border-color: rgba(255, 255, 255, 0.08);
        --border-subtle: rgba(255, 255, 255, 0.04);
        --brand-color: #f97316;
        --brand-hover: #ea580c;
        --brand-bg: rgba(249, 115, 22, 0.1);
        --card-bg: #171717;
        --card-border: rgba(255, 255, 255, 0.06);
        --code-bg: #0f0f0f;
        --code-text: #e5e5e5;
        --filter-invert: 1;
        --shadow-color: rgba(0, 0, 0, 0.5);
        
        --method-get-bg: rgba(59, 130, 246, 0.03);
        --method-get-border: rgba(59, 130, 246, 0.15);
        --method-get-text: #60a5fa;
        
        --method-post-bg: rgba(34, 197, 94, 0.03);
        --method-post-border: rgba(34, 197, 94, 0.15);
        --method-post-text: #4ade80;
        
        --method-put-bg: rgba(234, 179, 8, 0.03);
        --method-put-border: rgba(234, 179, 8, 0.15);
        --method-put-text: #facc15;
        
        --method-delete-bg: rgba(239, 68, 68, 0.03);
        --method-delete-border: rgba(239, 68, 68, 0.15);
        --method-delete-text: #f87171;
      }

      /* ─── Global Styles & Theme Transitions ────────────────────────────── */
      body { 
        margin: 0; 
        background: var(--bg-primary) !important; 
        color: var(--text-primary) !important; 
        font-family: 'DM Sans', sans-serif;
        transition: background-color 0.2s ease, color 0.2s ease;
      }
      
      .swagger-ui {
        font-family: 'DM Sans', sans-serif !important;
        background-color: var(--bg-primary) !important;
        color: var(--text-primary) !important;
        transition: background-color 0.2s ease, color 0.2s ease;
      }

      /* ─── Global Reset for Browser-Default Buttons in Swagger UI ────── */
      .swagger-ui button {
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        color: inherit !important;
        padding: 0 !important;
        margin: 0 !important;
        font-family: inherit !important;
        font-size: inherit !important;
        font-weight: inherit !important;
        line-height: inherit !important;
        box-shadow: none !important;
        text-shadow: none !important;
        outline: none !important;
      }
      
      .swagger-ui .info .title {
        font-family: 'Sora', sans-serif !important;
        color: var(--text-primary) !important;
        font-weight: 800 !important;
      }
      
      .swagger-ui h1, .swagger-ui h2, .swagger-ui h3, .swagger-ui h4, .swagger-ui h5, .swagger-ui h6 {
        font-family: 'Sora', sans-serif !important;
        color: var(--text-primary) !important;
      }

      .swagger-ui .info p, .swagger-ui .info li, .swagger-ui .info table, .swagger-ui .info td, .swagger-ui .info th {
        color: var(--text-secondary) !important;
        font-size: 14px;
        line-height: 1.6;
      }

      .swagger-ui .info h3 {
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 8px;
        margin-top: 24px;
      }
      
      .swagger-ui .markdown blockquote {
        border-left: 4px solid var(--brand-color) !important;
        background: var(--brand-bg) !important;
        color: var(--text-secondary) !important;
        padding: 12px 16px !important;
        margin: 16px 0 !important;
        border-radius: 0 8px 8px 0;
      }
      
      /* Tables */
      .swagger-ui table {
        border-collapse: collapse;
        width: 100%;
      }
      .swagger-ui table thead tr th {
        color: var(--text-primary) !important;
        border-bottom: 2px solid var(--border-color) !important;
        font-family: 'Sora', sans-serif !important;
        font-size: 13px !important;
        padding: 10px !important;
        text-align: left;
      }
      .swagger-ui table tbody tr td {
        padding: 10px !important;
        border-bottom: 1px solid var(--border-subtle) !important;
        color: var(--text-secondary) !important;
      }

      /* Topbar Styling */
      .swagger-ui .topbar { 
        background: var(--bg-secondary) !important; 
        border-bottom: 1px solid var(--border-color) !important; 
        padding: 16px 0;
      }
      .swagger-ui .topbar .download-url-wrapper { display: none !important; }
      .swagger-ui .topbar-wrapper {
        display: flex;
        align-items: center;
        max-width: 1460px;
        margin: 0 auto;
        padding: 0 20px;
        width: 100%;
      }
      .swagger-ui .topbar-wrapper::before {
        content: "OptSolv";
        font-family: 'Sora', sans-serif;
        font-weight: 800;
        font-size: 20px;
        color: var(--brand-color);
        margin-right: 8px;
        letter-spacing: -0.5px;
      }
      .swagger-ui .topbar-wrapper::after {
        content: "Time Tracker";
        font-family: 'Sora', sans-serif;
        font-weight: 500;
        font-size: 20px;
        color: var(--text-primary);
      }
      .swagger-ui .topbar img {
        display: none !important;
      }

      /* Premium Floating Theme Toggle Button */
      .theme-toggle-container {
        position: fixed;
        top: 24px;
        right: 24px;
        z-index: 99999;
      }
      .theme-toggle-btn {
        background: rgba(241, 243, 245, 0.8) !important;
        backdrop-filter: blur(8px) !important;
        -webkit-backdrop-filter: blur(8px) !important;
        border: 1px solid var(--border-color) !important;
        color: var(--text-primary) !important;
        padding: 8px !important;
        border-radius: 50% !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 44px !important;
        height: 44px !important;
        min-width: 44px !important;
        min-height: 44px !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }
      html.dark .theme-toggle-btn {
        background: rgba(38, 38, 38, 0.8) !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4) !important;
      }
      .theme-toggle-btn:hover {
        transform: scale(1.05);
        border-color: var(--brand-color) !important;
      }
      .theme-toggle-btn:active {
        transform: scale(0.95);
      }
      .theme-toggle-btn svg {
        width: 22px !important;
        height: 22px !important;
        stroke: var(--text-primary) !important;
        fill: none !important;
        display: inline-block !important;
      }
      
      html.dark .theme-toggle-btn .sun-icon {
        display: inline-block !important;
      }
      html.dark .theme-toggle-btn .moon-icon {
        display: none !important;
      }
      html:not(.dark) .theme-toggle-btn .sun-icon {
        display: none !important;
      }
      html:not(.dark) .theme-toggle-btn .moon-icon {
        display: inline-block !important;
      }

      /* Authentication Container */
      .swagger-ui .scheme-container {
        background: var(--bg-secondary) !important;
        box-shadow: none !important;
        border-bottom: 1px solid var(--border-color) !important;
        color: var(--text-primary) !important;
        padding: 20px 0 !important;
        margin-bottom: 20px;
      }
      .swagger-ui .scheme-container .schemes-title {
        color: var(--text-primary) !important;
        font-family: 'Sora', sans-serif !important;
        font-weight: 600;
      }

      /* Form elements */
      .swagger-ui select {
        background: var(--bg-secondary) !important;
        color: var(--text-primary) !important;
        border: 1px solid var(--border-color) !important;
        border-radius: 8px !important;
        padding: 6px 12px !important;
        outline: none;
      }
      .swagger-ui input[type=text] {
        background: var(--bg-secondary) !important;
        color: var(--text-primary) !important;
        border: 1px solid var(--border-color) !important;
        border-radius: 8px !important;
        padding: 8px 12px !important;
        outline: none;
        font-family: 'JetBrains Mono', monospace;
      }
      .swagger-ui input[type=text]:focus {
        border-color: var(--brand-color) !important;
        box-shadow: 0 0 0 2px var(--brand-bg) !important;
      }

      /* Tags and Operations */
      .swagger-ui .opblock-tag {
        color: var(--text-primary) !important;
        font-family: 'Sora', sans-serif !important;
        font-weight: 700 !important;
        border-bottom: 1px solid var(--border-color) !important;
        padding: 16px 0 8px 0 !important;
      }
      .swagger-ui .opblock-tag small {
        color: var(--text-tertiary) !important;
        font-family: 'DM Sans', sans-serif !important;
        font-size: 14px;
        margin-left: 12px;
      }

      /* Endpoint Cards */
      .swagger-ui .opblock {
        background: var(--card-bg) !important;
        border: 1px solid var(--card-border) !important;
        border-radius: 12px !important;
        box-shadow: 0 4px 6px -1px var(--shadow-color) !important;
        margin-bottom: 12px !important;
        overflow: hidden;
      }
      .swagger-ui .opblock .opblock-summary {
        padding: 12px 16px !important;
        border-bottom: 1px solid transparent;
        align-items: center;
      }
      .swagger-ui .opblock .opblock-summary-method {
        border-radius: 8px !important;
        font-family: 'Sora', sans-serif !important;
        font-weight: 700 !important;
        font-size: 12px !important;
        padding: 6px 16px !important;
        text-shadow: none !important;
        min-width: 80px;
        text-align: center;
      }
      .swagger-ui .opblock .opblock-summary-path {
        font-family: 'JetBrains Mono', monospace !important;
        font-weight: 600 !important;
        font-size: 14px !important;
        color: var(--text-primary) !important;
      }
      .swagger-ui .opblock .opblock-summary-description {
        font-family: 'DM Sans', sans-serif !important;
        color: var(--text-secondary) !important;
        font-size: 13px !important;
      }

      /* HTTP Methods customization */
      .swagger-ui .opblock.opblock-get {
        background: var(--method-get-bg) !important;
        border-color: var(--method-get-border) !important;
      }
      .swagger-ui .opblock.opblock-get .opblock-summary-method {
        background: #3b82f6 !important;
        color: #ffffff !important;
      }
      .swagger-ui .opblock.opblock-get .opblock-summary-path {
        color: var(--text-primary) !important;
      }
      
      .swagger-ui .opblock.opblock-post {
        background: var(--method-post-bg) !important;
        border-color: var(--method-post-border) !important;
      }
      .swagger-ui .opblock.opblock-post .opblock-summary-method {
        background: #22c55e !important;
        color: #ffffff !important;
      }
      .swagger-ui .opblock.opblock-post .opblock-summary-path {
        color: var(--text-primary) !important;
      }

      .swagger-ui .opblock.opblock-put {
        background: var(--method-put-bg) !important;
        border-color: var(--method-put-border) !important;
      }
      .swagger-ui .opblock.opblock-put .opblock-summary-method {
        background: #eab308 !important;
        color: #ffffff !important;
      }
      .swagger-ui .opblock.opblock-put .opblock-summary-path {
        color: var(--text-primary) !important;
      }

      .swagger-ui .opblock.opblock-delete {
        background: var(--method-delete-bg) !important;
        border-color: var(--method-delete-border) !important;
      }
      .swagger-ui .opblock.opblock-delete .opblock-summary-method {
        background: #ef4444 !important;
        color: #ffffff !important;
      }
      .swagger-ui .opblock.opblock-delete .opblock-summary-path {
        color: var(--text-primary) !important;
      }

      /* Endpoint details container (Expanded body) */
      .swagger-ui .opblock-body {
        background: var(--bg-tertiary) !important;
        padding: 20px !important;
      }
      .swagger-ui .opblock .opblock-section-header {
        background: var(--bg-secondary) !important;
        border-bottom: 1px solid var(--border-subtle) !important;
        padding: 10px 16px !important;
      }
      .swagger-ui .opblock .opblock-section-header h4 {
        color: var(--text-primary) !important;
        font-family: 'Sora', sans-serif !important;
        font-size: 14px !important;
        font-weight: 600;
      }

      /* Parameters */
      .swagger-ui .parameter__name {
        color: var(--text-primary) !important;
        font-family: 'JetBrains Mono', monospace !important;
        font-weight: 600 !important;
      }
      .swagger-ui .parameter__type {
        color: var(--text-secondary) !important;
        font-family: 'JetBrains Mono', monospace !important;
      }
      .swagger-ui .parameter__in {
        color: var(--text-tertiary) !important;
        font-family: 'DM Sans', sans-serif !important;
        font-size: 12px;
      }
      .swagger-ui .parameter__name.required::after {
        color: #ef4444 !important;
      }
      .swagger-ui .parameters-col_description p {
        color: var(--text-secondary) !important;
        font-family: 'DM Sans', sans-serif !important;
      }

      /* Responses */
      .swagger-ui .response-col_status {
        color: var(--text-primary) !important;
        font-family: 'Sora', sans-serif !important;
        font-size: 14px !important;
      }
      .swagger-ui .response-col_description {
        color: var(--text-secondary) !important;
      }

      /* Code Blocks & Previews */
      .swagger-ui pre {
        background: var(--code-bg) !important;
        border: 1px solid var(--border-color) !important;
        border-radius: 8px !important;
        padding: 16px !important;
        color: var(--code-text) !important;
        font-family: 'JetBrains Mono', monospace !important;
      }
      .swagger-ui code {
        font-family: 'JetBrains Mono', monospace !important;
      }
      .swagger-ui .highlight-code pre {
        background: var(--code-bg) !important;
        color: var(--code-text) !important;
      }
      .swagger-ui .microlight {
        font-family: 'JetBrains Mono', monospace !important;
        color: var(--code-text) !important;
      }

      /* Styled Buttons Overrides (Execute & Cancel) */
      .swagger-ui .btn.execute {
        background: var(--brand-color) !important;
        border-color: var(--brand-color) !important;
        color: #ffffff !important;
        font-family: 'Sora', sans-serif !important;
        font-weight: 600;
        font-size: 14px;
        padding: 8px 24px !important;
        border-radius: 8px !important;
      }
      .swagger-ui .btn.execute:hover {
        background: var(--brand-hover) !important;
        border-color: var(--brand-hover) !important;
      }
      .swagger-ui .btn.cancel {
        background: transparent !important;
        border-color: #ef4444 !important;
        color: #ef4444 !important;
        font-family: 'Sora', sans-serif !important;
        border-radius: 8px !important;
        padding: 8px 24px !important;
      }
      .swagger-ui .btn.cancel:hover {
        background: rgba(239, 68, 68, 0.05) !important;
      }
      
      /* Authorize Button */
      .swagger-ui .auth-wrapper {
        display: flex;
        justify-content: flex-end;
      }
      .swagger-ui .authorize {
        background: var(--brand-bg) !important;
        border: 1px solid var(--brand-color) !important;
        color: var(--brand-color) !important;
        border-radius: 8px !important;
        font-family: 'Sora', sans-serif !important;
        font-weight: 600;
        padding: 8px 20px !important;
      }
      .swagger-ui .authorize:hover {
        background: rgba(249, 115, 22, 0.15) !important;
      }
      .swagger-ui .authorize svg {
        fill: var(--brand-color) !important;
      }
      .swagger-ui .authorize.locked svg {
        fill: var(--brand-color) !important;
      }

      /* Security Lock Icons - Highly visible in Dark Mode */
      .swagger-ui .opblock-summary .authorization__btn,
      .swagger-ui .authorization__btn {
        opacity: 0.85 !important;
        transition: opacity 0.2s ease !important;
      }
      .swagger-ui .opblock-summary .authorization__btn:hover,
      .swagger-ui .authorization__btn:hover {
        opacity: 1 !important;
      }
      .swagger-ui .opblock-summary .authorization__btn svg,
      .swagger-ui .authorization__btn svg {
        fill: var(--text-primary) !important;
        stroke: var(--text-primary) !important;
        width: 18px !important;
        height: 18px !important;
      }
      .swagger-ui .opblock-summary .authorization__btn.locked svg,
      .swagger-ui .authorization__btn.locked svg {
        fill: var(--brand-color) !important;
        stroke: var(--brand-color) !important;
      }

      /* Dialogs & Modal Windows */
      .swagger-ui .dialog-ux .modal-ux {
        background: var(--bg-secondary) !important;
        border: 1px solid var(--border-color) !important;
        border-radius: 16px !important;
        box-shadow: 0 20px 25px -5px var(--shadow-color) !important;
        color: var(--text-primary) !important;
      }
      .swagger-ui .dialog-ux .modal-ux-header {
        border-bottom: 1px solid var(--border-color) !important;
        padding: 20px !important;
      }
      .swagger-ui .dialog-ux .modal-ux-header h3 {
        color: var(--text-primary) !important;
        font-family: 'Sora', sans-serif !important;
        font-weight: 700;
        font-size: 18px;
      }
      .swagger-ui .dialog-ux .modal-ux-header .close-modal {
        fill: var(--text-primary) !important;
      }
      .swagger-ui .dialog-ux .modal-ux-content {
        padding: 20px !important;
      }
      .swagger-ui .dialog-ux .modal-ux-content h4 {
        color: var(--text-primary) !important;
        font-family: 'Sora', sans-serif !important;
        font-size: 14px;
        margin-top: 16px;
      }
      .swagger-ui .dialog-ux .modal-ux-content p {
        color: var(--text-secondary) !important;
        font-family: 'DM Sans', sans-serif !important;
      }
      .swagger-ui .dialog-ux .modal-ux-content label {
        color: var(--text-secondary) !important;
        font-family: 'DM Sans', sans-serif !important;
        font-weight: 500;
      }

      /* Models (Schemas) Overrides - Fixing Contrast Issues */
      .swagger-ui section.models {
        border: 1px solid var(--border-color) !important;
        background: var(--card-bg) !important;
        border-radius: 12px !important;
        margin-top: 40px !important;
        overflow: hidden;
      }
      .swagger-ui section.models h4 {
        color: var(--text-primary) !important;
        font-family: 'Sora', sans-serif !important;
        font-weight: 700;
        border-bottom: 1px solid var(--border-color) !important;
        background: var(--bg-secondary) !important;
        padding: 16px 20px !important;
      }
      .swagger-ui section.models .model-container {
        background: var(--card-bg) !important;
        border-bottom: 1px solid var(--border-subtle) !important;
        padding: 12px 20px !important;
        margin: 0 !important;
      }
      
      /* Core Model Box Overrides */
      .swagger-ui .model-box {
        background: transparent !important;
        background-color: transparent !important;
      }
      .swagger-ui .model-box-control {
        background: transparent !important;
        background-color: transparent !important;
        color: var(--text-primary) !important;
      }
      .swagger-ui .model-title {
        color: var(--text-primary) !important;
        font-family: 'Sora', sans-serif !important;
        font-weight: 600;
      }
      .swagger-ui .model {
        color: var(--text-secondary) !important;
        font-family: 'JetBrains Mono', monospace !important;
        background: transparent !important;
      }
      .swagger-ui .prop-name {
        color: var(--text-primary) !important;
      }
      .swagger-ui .prop-type {
        color: var(--brand-color) !important;
      }
      
      /* Invert Swagger UI original assets when in dark mode */
      .swagger-ui .model-toggle {
        filter: var(--filter-invert) !important;
      }
      
      /* Layout structure wrapper */
      .swagger-ui .wrapper {
        max-width: 1460px !important;
        padding: 0 20px !important;
      }
      
      /* Tabs control */
      .swagger-ui .tabli button {
        color: var(--text-secondary) !important;
        font-family: 'Sora', sans-serif !important;
      }
      .swagger-ui .tabli.active button {
        color: var(--brand-color) !important;
        font-weight: bold;
      }

      /* Copy code action */
      .swagger-ui .copy-to-clipboard {
        background: var(--bg-tertiary) !important;
        border-radius: 4px;
        border: 1px solid var(--border-color);
      }
      .swagger-ui .copy-to-clipboard button {
        filter: var(--filter-invert) !important;
      }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      // 1. Immediately apply theme class to html to prevent flash (wrapped in try/catch for Tracking Prevention compatibility)
      let savedTheme = 'dark';
      try {
        savedTheme = localStorage.getItem('swagger-theme') || 'dark';
      } catch (e) {
        console.warn("localStorage is blocked or unavailable. Defaulting to dark theme.");
      }
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');

      // 2. Define theme toggle function
      function injectThemeToggle() {
        try {
          if (!document.getElementById('theme-toggle')) {
            const toggleContainer = document.createElement('div');
            toggleContainer.className = 'theme-toggle-container';
            toggleContainer.innerHTML = \`
              <button id="theme-toggle" class="theme-toggle-btn" aria-label="Alternar tema">
                <svg class="sun-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
                <svg class="moon-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              </button>
            \`;
            document.body.appendChild(toggleContainer);

            const toggleBtn = document.getElementById('theme-toggle');
            toggleBtn.addEventListener('click', () => {
              const isDark = document.documentElement.classList.toggle('dark');
              try {
                localStorage.setItem('swagger-theme', isDark ? 'dark' : 'light');
              } catch (e) {
                console.warn("localStorage is blocked or unavailable. Theme setting will not persist.");
              }
            });
          }
        } catch (e) {
          console.error("Theme toggle injection failed:", e);
        }
      }

      // 3. Immediately run theme toggle injection
      injectThemeToggle();

      // Also ensure it runs once DOM content is interactive
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectThemeToggle);
      } else {
        injectThemeToggle();
      }

      // 4. Initialize Swagger UI
      try {
        SwaggerUIBundle({
          url: '${specUrl}',
          dom_id: '#swagger-ui',
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
          layout: 'BaseLayout',
          deepLinking: true,
          defaultModelsExpandDepth: 2,
        });
      } catch (e) {
        console.error("SwaggerUI init failed:", e);
      }
    </script>
  </body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
