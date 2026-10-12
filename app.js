/* ═══════════════════════════════════════════════════════════════════════
   AUDIT INDEPENDER — Application Logic
   Navigation: Worklist | Dossiers | Establishments | Establishment Detail | Dossier Detail
   ═══════════════════════════════════════════════════════════════════════ */

// ─── Theme Management (Fast CSS bootstrap before DOM ready) ───
(function bootstrapTheme() {
  const savedMode = localStorage.getItem('audit_independer_theme_pref') || localStorage.getItem('audit_independer_theme') || 'dark';
  const resolvedMode = savedMode === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : savedMode;
  document.documentElement.setAttribute('data-theme', resolvedMode);
  
  const savedPalette = localStorage.getItem('audit_theme_palette') || 'calm';
  document.documentElement.setAttribute('data-palette', savedPalette);
  
  const savedSize = localStorage.getItem('audit_theme_text_size') || 'normal';
  document.documentElement.setAttribute('data-text-size', savedSize);
  
  const savedAccent = localStorage.getItem('audit_custom_accent_hex');
  if (savedAccent) {
    document.documentElement.style.setProperty('--accent-blue', savedAccent);
    document.documentElement.style.setProperty('--border-focus', savedAccent);
  }
})();

function initTheme() {
  if (typeof initUserTheme === 'function') {
    initUserTheme();
  }
}

function applyTheme(theme) {
  if (typeof setThemeMode === 'function') {
    setThemeMode(theme, false);
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  if (typeof setThemeMode === 'function') {
    setThemeMode(newTheme);
  } else {
    applyTheme(newTheme);
  }
}

window.initTheme = initTheme;
window.applyTheme = applyTheme;
window.toggleTheme = toggleTheme;

// ═══════════════════════════════════════════════════════════════════════
// RBAC ENGINE — Roles, Permissions & Current User
// ═══════════════════════════════════════════════════════════════════════

const RBAC = {
  roles: {
    coordinator: {
      id: 'coordinator',
      label: 'Coördinator',
      shortLabel: 'COO',
      icon: 'admin_panel_settings',
      color: '#3b82f6',
      description: 'Beheert dossiers, facturering, betalingen en stamdata.',
      permissions: [
        'dossier.view', 'dossier.manage',
        'price_commission', 'invoice_audit_fee', 'register_payment',
        'national_operator_informed',
        'settings.view', 'settings.price_rules',
        'establishments.view', 'auditors.view',
        'worklist.view', 'watch.view',
        'parties.view'
      ]
    },
    assigner: {
      id: 'assigner',
      label: 'Toewijzer',
      shortLabel: 'TOE',
      icon: 'assignment_ind',
      color: '#8b5cf6',
      description: 'Wijst auditors toe aan dossiers op basis van competenties.',
      permissions: [
        'dossier.view',
        'assign_auditor', 'propose_auditor',
        'establishments.view', 'auditors.view',
        'worklist.view', 'watch.view',
        'parties.view', 'settings.view'
      ]
    },
    reviewer: {
      id: 'reviewer',
      label: 'Beoordelaar',
      shortLabel: 'BEO',
      icon: 'gavel',
      color: '#f59e0b',
      description: 'Beoordeelt auditrapporten, schrijft conceptbesluiten en neemt besluiten.',
      permissions: [
        'dossier.view',
        'draft_decision', 'take_decision',
        'gate_check_review',
        'establishments.view', 'auditors.view',
        'worklist.view', 'watch.view',
        'parties.view', 'settings.view'
      ]
    }
  },

  currentRole: null,

  init() {
    const saved = localStorage.getItem('audit_independer_role') || 'coordinator';
    this.setRole(saved);
  },

  setRole(roleId) {
    if (!this.roles[roleId]) roleId = 'coordinator';
    this.currentRole = roleId;
    localStorage.setItem('audit_independer_role', roleId);
    this.updateUI();
    // Re-render dossier if open
    const dossierView = document.getElementById('dossier-view');
    if (dossierView && !dossierView.classList.contains('hidden')) {
      renderDossierActions();
    }
  },

  getRole() {
    return this.roles[this.currentRole] || this.roles.coordinator;
  },

  hasPermission(permission) {
    const role = this.getRole();
    return role.permissions.includes(permission);
  },

  updateUI() {
    const role = this.getRole();

    // Update role indicator in topbar
    const roleLabel = document.getElementById('rbac-role-label');
    const roleIcon = document.getElementById('rbac-role-icon');
    const roleBadge = document.getElementById('rbac-role-badge');
    if (roleLabel) roleLabel.textContent = role.label;
    if (roleIcon) roleIcon.textContent = role.icon;
    if (roleBadge) roleBadge.style.background = role.color;

    // Update role switcher dropdown active state
    document.querySelectorAll('.role-switch-option').forEach(opt => {
      opt.classList.toggle('active', opt.dataset.role === this.currentRole);
    });

    // Ensure Settings nav is always visible in the top navigation bar
    const settingsNav = document.getElementById('nav-settings');
    if (settingsNav) {
      settingsNav.style.display = '';
    }
  }
};

window.RBAC = RBAC;

// ═══════════════════════════════════════════════════════════════════════
// DOSSIER STATE MACHINE — Lifecycle & Transitions
// ═══════════════════════════════════════════════════════════════════════

const DOSSIER_STATES = {
  application: {
    id: 'application',
    label: 'Application',
    labelNL: 'Aanvraag',
    step: 1,
    icon: 'description',
    color: '#64748b'
  },
  pre_screening: {
    id: 'pre_screening',
    label: 'Pre-screening',
    labelNL: 'Pre-screening',
    step: 1,
    icon: 'search',
    color: '#64748b'
  },
  auditor_proposed: {
    id: 'auditor_proposed',
    label: 'Auditor proposed',
    labelNL: 'Auditor voorgesteld',
    step: 2,
    icon: 'person_search',
    color: '#8b5cf6'
  },
  accepted_by_establishment: {
    id: 'accepted_by_establishment',
    label: 'Accepted by establishment',
    labelNL: 'Aanvaard door vestiging',
    step: 2,
    icon: 'handshake',
    color: '#8b5cf6'
  },
  invoiced: {
    id: 'invoiced',
    label: 'Invoiced',
    labelNL: 'Gefactureerd',
    step: 3,
    icon: 'receipt_long',
    color: '#f59e0b'
  },
  paid: {
    id: 'paid',
    label: 'Paid',
    labelNL: 'Betaald',
    step: 3,
    icon: 'payments',
    color: '#22c55e'
  },
  in_audit: {
    id: 'in_audit',
    label: 'In audit',
    labelNL: 'In audit',
    step: 4,
    icon: 'fact_check',
    color: '#3b82f6'
  },
  in_review: {
    id: 'in_review',
    label: 'In review',
    labelNL: 'In beoordeling',
    step: 5,
    icon: 'rate_review',
    color: '#f59e0b'
  },
  in_decision: {
    id: 'in_decision',
    label: 'In decision',
    labelNL: 'In besluit',
    step: 6,
    icon: 'gavel',
    color: '#ef4444'
  },
  certified: {
    id: 'certified',
    label: 'Certified',
    labelNL: 'Gecertificeerd',
    step: 7,
    icon: 'workspace_premium',
    color: '#22c55e'
  },
  under_surveillance: {
    id: 'under_surveillance',
    label: 'Under surveillance',
    labelNL: 'Onder surveillance',
    step: 8,
    icon: 'monitoring',
    color: '#a855f7'
  },
  suspended: {
    id: 'suspended',
    label: 'Suspended',
    labelNL: 'Opgeschort',
    step: 8,
    icon: 'pause_circle',
    color: '#ef4444'
  },
  refused: {
    id: 'refused',
    label: 'Refused',
    labelNL: 'Geweigerd',
    step: 6,
    icon: 'cancel',
    color: '#ef4444'
  }
};

// Transition definitions: from → [{ to, action, requiredRole, label, labelNL, validate? }]
const DOSSIER_TRANSITIONS = {
  application: [
    {
      to: 'pre_screening',
      action: 'start_prescreening',
      requiredRole: 'coordinator',
      label: 'Start pre-screening',
      labelNL: 'Start pre-screening',
      permission: 'dossier.manage'
    }
  ],
  pre_screening: [
    {
      to: 'auditor_proposed',
      action: 'propose_auditor',
      requiredRole: 'assigner',
      label: 'Propose auditor',
      labelNL: 'Auditor voorstellen',
      permission: 'propose_auditor'
    }
  ],
  auditor_proposed: [
    {
      to: 'accepted_by_establishment',
      action: 'establishment_accepts',
      requiredRole: 'coordinator',
      label: 'Record: accepted by establishment',
      labelNL: 'Registreer: aanvaard door vestiging',
      permission: 'dossier.manage'
    }
  ],
  accepted_by_establishment: [
    {
      to: 'invoiced',
      action: 'invoice_audit_fee',
      requiredRole: 'coordinator',
      label: 'Invoice the audit fee',
      labelNL: 'Factureer de auditkosten',
      permission: 'invoice_audit_fee',
      preAction: 'price_commission'
    }
  ],
  invoiced: [
    {
      to: 'paid',
      action: 'register_payment',
      requiredRole: 'coordinator',
      label: 'Register payment of audit fee',
      labelNL: 'Registreer betaling auditkosten',
      permission: 'register_payment',
      validate: 'validateCurrencyB054'
    }
  ],
  paid: [
    {
      to: 'in_audit',
      action: 'start_audit',
      requiredRole: 'coordinator',
      label: 'Record: audit started',
      labelNL: 'Registreer: audit gestart',
      permission: 'dossier.manage'
    }
  ],
  in_audit: [
    {
      to: 'in_review',
      action: 'audit_report_received',
      requiredRole: 'coordinator',
      label: 'Record: audit report received',
      labelNL: 'Registreer: auditrapport ontvangen',
      permission: 'dossier.manage'
    }
  ],
  in_review: [
    {
      to: 'in_decision',
      action: 'draft_decision',
      requiredRole: 'reviewer',
      label: 'Draft decision & move to decision',
      labelNL: 'Conceptbesluit opstellen & naar besluit',
      permission: 'draft_decision'
    }
  ],
  in_decision: [
    {
      to: 'certified',
      action: 'grant',
      requiredRole: 'reviewer',
      label: 'Grant certification',
      labelNL: 'Certificaat verlenen',
      permission: 'take_decision',
      decisionType: 'grant'
    },
    {
      to: 'certified',
      action: 'certify_conditional',
      requiredRole: 'reviewer',
      label: 'Certify subject to additional evidence',
      labelNL: 'Certificeer onder voorbehoud van aanvullend bewijs',
      permission: 'take_decision',
      decisionType: 'conditional'
    },
    {
      to: 'refused',
      action: 'refuse',
      requiredRole: 'reviewer',
      label: 'Refuse',
      labelNL: 'Weigeren',
      permission: 'take_decision',
      decisionType: 'refuse',
      danger: true
    }
  ],
  certified: [
    {
      to: 'under_surveillance',
      action: 'national_operator_informed',
      requiredRole: 'coordinator',
      label: 'National Operator informed',
      labelNL: 'Nationale Operator geïnformeerd',
      permission: 'national_operator_informed'
    }
  ],
  under_surveillance: [
    // Surveillance cycle — no direct forward transition to another main state from here
    // but can open new surveillance cycle
  ]
};

// Business Rule B-054: Currency validation
function validateCurrencyB054(dossier) {
  if (!dossier.financials) return { valid: true };
  const currencies = dossier.financials.currencies || [];
  if (currencies.length > 1) {
    return {
      valid: false,
      rule: 'B-054',
      message: `Meerdere valuta gedetecteerd (${currencies.join(', ')}). Handmatige controle vereist — het systeem ondersteunt geen automatische wisselkoersen.`,
      messageEN: `Multiple currencies detected (${currencies.join(', ')}). Manual check required — the system does not support automatic exchange rates.`
    };
  }
  return { valid: true };
}

// Get available transitions for a dossier based on its state and current role
function getAvailableTransitions(dossierState) {
  const stateKey = dossierState.toLowerCase().replace(/ /g, '_');
  const transitions = DOSSIER_TRANSITIONS[stateKey] || [];
  const currentRole = RBAC.currentRole;

  return transitions.map(t => {
    const hasPermission = RBAC.hasPermission(t.permission);
    const isCorrectRole = t.requiredRole === currentRole;
    const roleLabel = RBAC.roles[t.requiredRole]?.label || t.requiredRole;

    return {
      ...t,
      available: hasPermission && isCorrectRole,
      roleRequired: roleLabel,
      blockedReason: !isCorrectRole
        ? `Deze actie is voorbehouden aan de rol "${roleLabel}".`
        : (!hasPermission ? 'U heeft geen rechten voor deze actie.' : null)
    };
  });
}

// Execute a dossier transition (simulated)
function executeDossierTransition(dossierNumber, transitionAction) {
  const dossier = DOSSIER_MAP[dossierNumber];
  if (!dossier) return;

  const stateKey = dossier.state.toLowerCase().replace(/ /g, '_');
  const transitions = DOSSIER_TRANSITIONS[stateKey] || [];
  const transition = transitions.find(t => t.action === transitionAction);
  if (!transition) return;

  // Check role permission
  if (!RBAC.hasPermission(transition.permission)) {
    showToast('Geen rechten', `U heeft geen rechten om deze actie uit te voeren.`, 'error');
    return;
  }

  // Run validation if defined
  if (transition.validate) {
    const result = window[transition.validate](dossier);
    if (!result.valid) {
      showToast(`Geblokkeerd (Regel ${result.rule})`, result.message, 'error');
      return;
    }
  }

  // Pre-action check (e.g., price_commission before invoice)
  if (transition.preAction === 'price_commission' && !dossier.commissionPriced) {
    showPriceCommissionModal(dossier);
    return;
  }

  // Execute transition
  const prevState = dossier.state;
  const newStateDef = DOSSIER_STATES[transition.to];
  dossier.state = newStateDef.label;
  dossier.step = newStateDef.step;

  // Add to history
  if (!dossier.transitionHistory) dossier.transitionHistory = [];
  dossier.transitionHistory.push({
    date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    from: prevState,
    to: newStateDef.label,
    actor: RBAC.getRole().label,
    action: transition.label
  });

  showToast('Status bijgewerkt', `Dossier ${dossier.number}: ${prevState} → ${newStateDef.label}`, 'success');

  // Re-render the dossier view
  showDossier(dossierNumber, currentOriginView);
}

// Price Commission Modal (pre-step before invoicing)
function showPriceCommissionModal(dossier) {
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!modal || !content) return;

  const rule = PRICE_RULES.find(r => r.country === (dossier.country || 'Netherlands') && r.active) || PRICE_RULES[0];
  const baseRate = rule ? rule.baseRate : 650;
  const travelEst = rule ? rule.travelEstimate : 120;
  const total = baseRate + travelEst;

  content.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">
        <span class="material-symbols-outlined" style="color:#3b82f6;">calculate</span>
        Price the commission
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="modal-body">
      <p class="body-paragraph">Stel de commissieprijs en reiskosten vast voor dossier <strong>${dossier.number}</strong>.</p>

      <div class="modal-form-grid">
        <div class="modal-field">
          <label>Audit base rate (€)</label>
          <input type="number" id="modal-base-rate" value="${baseRate}" class="modal-input" />
        </div>
        <div class="modal-field">
          <label>Travel estimate (€)</label>
          <input type="number" id="modal-travel" value="${travelEst}" class="modal-input" />
        </div>
        <div class="modal-field">
          <label>Currency</label>
          <select id="modal-currency" class="modal-input">
            <option value="EUR" selected>EUR — Euro</option>
            <option value="USD">USD — US Dollar</option>
            <option value="GBP">GBP — British Pound</option>
          </select>
        </div>
        <div class="modal-field">
          <label>Total estimated</label>
          <div class="modal-total">€ ${total.toLocaleString()}</div>
        </div>
      </div>

      <div class="modal-info-box">
        <span class="material-symbols-outlined" style="font-size:16px;">info</span>
        <span>Prijsregel toegepast: <strong>${rule ? rule.label : 'Standaard'}</strong> — ${rule ? rule.country : 'N/A'}</span>
      </div>
    </div>
    <div class="modal-footer">
      <button class="modal-btn secondary" onclick="closeModal()">Annuleren</button>
      <button class="modal-btn primary" onclick="confirmPriceCommission('${dossier.number}')">
        <span class="material-symbols-outlined" style="font-size:16px;">check</span>
        Prijs vaststellen & factureren
      </button>
    </div>
  `;

  modal.classList.add('visible');

  // Live total update
  const baseInput = document.getElementById('modal-base-rate');
  const travelInput = document.getElementById('modal-travel');
  if (baseInput && travelInput) {
    const updateTotal = () => {
      const t = (parseFloat(baseInput.value) || 0) + (parseFloat(travelInput.value) || 0);
      const totalEl = content.querySelector('.modal-total');
      if (totalEl) totalEl.textContent = `€ ${t.toLocaleString()}`;
    };
    baseInput.addEventListener('input', updateTotal);
    travelInput.addEventListener('input', updateTotal);
  }
}

function confirmPriceCommission(dossierNumber) {
  const dossier = DOSSIER_MAP[dossierNumber];
  if (!dossier) return;

  const baseRate = parseFloat(document.getElementById('modal-base-rate')?.value) || 650;
  const travel = parseFloat(document.getElementById('modal-travel')?.value) || 120;
  const currency = document.getElementById('modal-currency')?.value || 'EUR';

  dossier.commissionPriced = true;
  dossier.financials = {
    baseRate: baseRate,
    travelEstimate: travel,
    total: baseRate + travel,
    currencies: [currency],
    pricedDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    pricedBy: RBAC.getRole().label
  };

  closeModal();

  // Now continue with the invoice transition
  executeDossierTransition(dossierNumber, 'invoice_audit_fee');
}

function closeModal() {
  const modal = document.getElementById('modal-overlay');
  if (modal) modal.classList.remove('visible');
}

// Toast notification system
function showToast(title, message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-notification toast-${type}`;
  const icon = type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info';
  toast.innerHTML = `
    <span class="material-symbols-outlined toast-icon">${icon}</span>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">
      <span class="material-symbols-outlined" style="font-size:16px;">close</span>
    </button>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// Render dossier action buttons based on current role & state
function renderDossierActions() {
  const actionsContainer = document.getElementById('dossier-actions-panel');
  if (!actionsContainer) return;

  const dossierTitleEl = document.getElementById('dossier-display-title');
  if (!dossierTitleEl) return;

  // Find current dossier
  const currentDossierNumber = document.getElementById('dossier-number-val')?.textContent?.trim();
  const dossier = DOSSIER_MAP[currentDossierNumber];
  if (!dossier) return;

  const stateKey = dossier.state.toLowerCase().replace(/ /g, '_');
  const stateDef = DOSSIER_STATES[stateKey] || DOSSIER_STATES.application;
  const transitions = getAvailableTransitions(dossier.state);
  const role = RBAC.getRole();

  let html = `
    <div class="actions-panel-header">
      <div class="actions-panel-title">
        <span class="material-symbols-outlined" style="color:${stateDef.color}; font-size:20px;">${stateDef.icon}</span>
        <span>Beschikbare acties</span>
      </div>
      <div class="actions-panel-role">
        <span class="role-indicator-dot" style="background:${role.color};"></span>
        <span>Ingelogd als: <strong>${role.label}</strong></span>
      </div>
    </div>
  `;

  if (transitions.length === 0) {
    html += `
      <div class="actions-empty-state">
        <span class="material-symbols-outlined" style="font-size:28px; color:var(--text-muted);">block</span>
        <p>Geen overgangen beschikbaar vanuit status "${dossier.state}".</p>
      </div>
    `;
  } else {
    html += '<div class="actions-list">';
    transitions.forEach(t => {
      const availClass = t.available ? 'action-available' : 'action-blocked';
      const dangerClass = t.danger ? 'action-danger' : '';
      const btnClass = t.available ? (t.danger ? 'danger' : 'primary') : 'disabled';
      const targetState = DOSSIER_STATES[t.to];

      html += `
        <div class="action-item ${availClass} ${dangerClass}">
          <div class="action-item-main">
            <div class="action-item-info">
              <div class="action-item-label">${t.label}</div>
              <div class="action-item-meta">
                <span class="material-symbols-outlined" style="font-size:13px;">arrow_forward</span>
                Naar: <strong>${targetState?.label || t.to}</strong>
                · Vereist: <strong>${t.roleRequired}</strong>
              </div>
            </div>
            <button class="action-execute-btn ${btnClass}"
                    ${t.available ? `onclick="executeDossierTransition('${currentDossierNumber}', '${t.action}')"` : 'disabled'}
                    title="${t.blockedReason || ''}">
              ${t.available
                ? `<span class="material-symbols-outlined" style="font-size:16px;">play_arrow</span> Uitvoeren`
                : `<span class="material-symbols-outlined" style="font-size:16px;">lock</span> Geblokkeerd`
              }
            </button>
          </div>
          ${!t.available ? `<div class="action-blocked-reason">${t.blockedReason}</div>` : ''}
        </div>
      `;
    });
    html += '</div>';
  }

  // Add "Price the commission" as a standalone action for coordinator on accepted_by_establishment
  if (stateKey === 'accepted_by_establishment' && RBAC.hasPermission('price_commission')) {
    html += `
      <div class="actions-pre-step">
        <div class="actions-pre-step-label">Voorbereidende stap</div>
        <button class="action-execute-btn primary wide"
                onclick="showPriceCommissionModal(DOSSIER_MAP['${currentDossierNumber}'])">
          <span class="material-symbols-outlined" style="font-size:16px;">calculate</span>
          Price the commission
        </button>
        <div class="actions-pre-step-note">Berekent de prijs en reiskosten van de commissie. Dit is vereist vóór facturering.</div>
      </div>
    `;
  }

  actionsContainer.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════
// PRICE RULES — Settings Module
// ═══════════════════════════════════════════════════════════════════════

const PRICE_RULES = [
  {
    rule: 1,
    id: 'PR-001',
    country: 'All countries',
    category: 'All categories',
    size: 'All sizes',
    auditor: 'All auditors',
    hours: '—',
    sale: 'EUR 90.00 per hour',
    purchase: 'EUR 65.00 per hour',
    source: 'invented tariff of the practice world, looked at again',
    lastChanged: '10 Oct 2026',
    baseRate: 90,
    travelEstimate: 0,
    currency: 'EUR',
    active: true
  },
  {
    rule: 2,
    id: 'PR-002',
    country: 'Finland (FI)',
    category: 'All categories',
    size: 'All sizes',
    auditor: 'All auditors',
    hours: '—',
    sale: 'EUR 450.00, lump sum',
    purchase: 'EUR 320.00, lump sum',
    source: 'CLAUDE.md § 2.1, «Finland € 450 vast» — werkwaarde from B-017, not confirmed in writing',
    lastChanged: '12 Oct 2026',
    baseRate: 450,
    travelEstimate: 0,
    currency: 'EUR',
    active: true
  },
  {
    rule: 3,
    id: 'PR-003',
    country: 'Belgium (BE)',
    category: 'Hotels and hostels (HH)',
    size: 'All sizes',
    auditor: 'All auditors',
    hours: '—',
    sale: 'EUR 520.00, lump sum',
    purchase: 'EUR 380.00, lump sum',
    source: 'CLAUDE.md § 2.1, «België vast per categorie × grootte» — the amount is invented; «size» is one of the three open questions',
    lastChanged: '12 Oct 2026',
    baseRate: 520,
    travelEstimate: 150,
    currency: 'EUR',
    active: true
  },
  {
    rule: 4,
    id: 'PR-004',
    country: 'All countries',
    category: 'Hotels and hostels (HH)',
    size: 'Very small, fewer than 5 FTE',
    auditor: 'All auditors',
    hours: '—',
    sale: 'EUR 350.00, lump sum',
    purchase: 'EUR 230.00, lump sum',
    source: 'invented price list of the practice world (B-365)',
    lastChanged: '7 Oct 2026',
    baseRate: 350,
    travelEstimate: 120,
    currency: 'EUR',
    active: true
  },
  {
    rule: 5,
    id: 'PR-005',
    country: 'All countries',
    category: 'Hotels and hostels (HH)',
    size: 'Small, 6-25 FTE',
    auditor: 'All auditors',
    hours: '—',
    sale: 'EUR 400.00, lump sum',
    purchase: 'EUR 270.00, lump sum',
    source: 'invented price list of the practice world (B-365)',
    lastChanged: '7 Oct 2026',
    baseRate: 400,
    travelEstimate: 120,
    currency: 'EUR',
    active: true
  },
  {
    rule: 6,
    id: 'PR-006',
    country: 'All countries',
    category: 'Hotels and hostels (HH)',
    size: 'Medium, 26-100 FTE',
    auditor: 'All auditors',
    hours: '—',
    sale: 'EUR 450.00, lump sum',
    purchase: 'EUR 300.00, lump sum',
    source: 'invented price list of the practice world (B-365)',
    lastChanged: '7 Oct 2026',
    baseRate: 450,
    travelEstimate: 120,
    currency: 'EUR',
    active: true
  },
  {
    rule: 7,
    id: 'PR-007',
    country: 'All countries',
    category: 'Hotels and hostels (HH)',
    size: 'Large, 101-250 FTE',
    auditor: 'All auditors',
    hours: '—',
    sale: 'EUR 500.00, lump sum',
    purchase: 'EUR 340.00, lump sum',
    source: 'invented price list of the practice world (B-365)',
    lastChanged: '7 Oct 2026',
    baseRate: 500,
    travelEstimate: 120,
    currency: 'EUR',
    active: true
  },
  {
    rule: 8,
    id: 'PR-008',
    country: 'All countries',
    category: 'Hotels and hostels (HH)',
    size: 'Very large, more than 250 FTE',
    auditor: 'All auditors',
    hours: '—',
    sale: 'EUR 550.00, lump sum',
    purchase: 'EUR 380.00, lump sum',
    source: 'invented price list of the practice world (B-365)',
    lastChanged: '7 Oct 2026',
    baseRate: 550,
    travelEstimate: 120,
    currency: 'EUR',
    active: true
  },
  {
    rule: 9,
    id: 'PR-009',
    country: 'All countries',
    category: 'Campsites and holiday parks (CHP)',
    size: 'Very small, fewer than 5 FTE',
    auditor: 'All auditors',
    hours: '—',
    sale: 'EUR 350.00, lump sum',
    purchase: 'EUR 230.00, lump sum',
    source: 'invented price list of the practice world (B-365)',
    lastChanged: '7 Oct 2026',
    baseRate: 350,
    travelEstimate: 120,
    currency: 'EUR',
    active: true
  },
  {
    rule: 10,
    id: 'PR-010',
    country: 'All countries',
    category: 'Campsites and holiday parks (CHP)',
    size: 'Small, 6-25 FTE',
    auditor: 'All auditors',
    hours: '—',
    sale: 'EUR 400.00, lump sum',
    purchase: 'EUR 420.00, lump sum',
    source: 'invented price list of the practice world (B-365)',
    lastChanged: '7 Oct 2026',
    baseRate: 400,
    travelEstimate: 120,
    currency: 'EUR',
    active: true
  },
  {
    rule: 11,
    id: 'PR-011',
    country: 'All countries',
    category: 'Campsites and holiday parks (CHP)',
    size: 'Medium, 26-100 FTE',
    auditor: 'All auditors',
    hours: '—',
    sale: 'EUR 450.00, lump sum',
    purchase: 'EUR 300.00, lump sum',
    source: 'invented price list of the practice world (B-365)',
    lastChanged: '7 Oct 2026',
    baseRate: 450,
    travelEstimate: 120,
    currency: 'EUR',
    active: true
  },
  {
    rule: 12,
    id: 'PR-012',
    country: 'All countries',
    category: 'Conference centres (CC)',
    size: 'Small, 6-25 FTE',
    auditor: 'All auditors',
    hours: '—',
    sale: 'EUR 400.00, lump sum',
    purchase: 'EUR 270.00, lump sum',
    source: 'invented price list of the practice world (B-365)',
    lastChanged: '7 Oct 2026',
    baseRate: 400,
    travelEstimate: 120,
    currency: 'EUR',
    active: true
  },
  {
    rule: 13,
    id: 'PR-013',
    country: 'All countries',
    category: 'Conference centres (CC)',
    size: 'Medium, 26-100 FTE',
    auditor: 'All auditors',
    hours: '—',
    sale: 'EUR 450.00, lump sum',
    purchase: 'EUR 300.00, lump sum',
    source: 'Set by Officer on 7 Oct 2026: Conference centres (CC), Medium, All countries',
    lastChanged: '7 Oct 2026',
    baseRate: 450,
    travelEstimate: 120,
    currency: 'EUR',
    active: true
  }
];

let priceRulesCurrentPage = 1;
let priceRulesPerPage = 10;
let priceRulesFilters = {
  search: '',
  country: '',
  category: '',
  type: ''
};

function getFilteredPriceRules() {
  const search = (priceRulesFilters.search || '').toLowerCase().trim();
  const country = (priceRulesFilters.country || '').trim();
  const category = (priceRulesFilters.category || '').trim();
  const type = (priceRulesFilters.type || '').trim();

  return PRICE_RULES.filter(r => {
    if (search) {
      const match = (
        r.rule.toString().includes(search) ||
        r.country.toLowerCase().includes(search) ||
        r.category.toLowerCase().includes(search) ||
        r.size.toLowerCase().includes(search) ||
        r.sale.toLowerCase().includes(search) ||
        r.purchase.toLowerCase().includes(search) ||
        r.source.toLowerCase().includes(search)
      );
      if (!match) return false;
    }
    if (country && r.country !== country) return false;
    if (category && r.category !== category) return false;
    if (type && !r.sale.toLowerCase().includes(type.toLowerCase())) return false;
    return true;
  });
}

function renderPriceRulesTable() {
  const tbody = document.getElementById('price-rules-tbody');
  if (!tbody) return;

  const filtered = getFilteredPriceRules();
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / priceRulesPerPage));

  if (priceRulesCurrentPage > totalPages) {
    priceRulesCurrentPage = totalPages;
  }

  const startIdx = (priceRulesCurrentPage - 1) * priceRulesPerPage;
  const endIdx = startIdx + priceRulesPerPage;
  const pageRules = filtered.slice(startIdx, endIdx);

  // Results count
  const countEl = document.getElementById('price-rules-count-text');
  if (countEl) countEl.textContent = `${total} result${total === 1 ? '' : 's'}`;

  // Showing X to Y of Z
  const showingEl = document.getElementById('price-rules-showing-info');
  if (showingEl) {
    if (total === 0) {
      showingEl.textContent = 'Showing 0 results';
    } else {
      showingEl.textContent = `Showing ${startIdx + 1} to ${Math.min(endIdx, total)} of ${total} results`;
    }
  }

  // Render Table Rows
  if (pageRules.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" style="text-align: center; padding: 36px; color: var(--text-muted);">
          No price rules match the current filters.
        </td>
      </tr>
    `;
  } else {
    tbody.innerHTML = pageRules.map(r => `
      <tr>
        <td class="td-rule">${r.rule}</td>
        <td class="td-country">${r.country}</td>
        <td class="td-category">${r.category}</td>
        <td class="td-size">${r.size}</td>
        <td class="td-auditor">${r.auditor}</td>
        <td class="td-hours">${r.hours}</td>
        <td class="td-sale">${r.sale}</td>
        <td class="td-purchase">${r.purchase}</td>
        <td class="td-source">${r.source}</td>
        <td class="td-date">${r.lastChanged}</td>
        <td style="text-align: right;">
          <button class="rule-open-btn" onclick="openPriceRuleDetailModal(${r.rule})">
            <span class="material-symbols-outlined" style="font-size: 15px;">visibility</span>
            Open
          </button>
        </td>
      </tr>
    `).join('');
  }

  // Update Page Buttons
  renderPriceRulesPaginationButtons(totalPages);

  // Update Per-page pills active state
  const perPageBtns = document.querySelectorAll('#price-rules-per-page-btns .per-page-pill');
  perPageBtns.forEach(btn => {
    if (parseInt(btn.textContent.trim(), 10) === priceRulesPerPage) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function renderPriceRulesPaginationButtons(totalPages) {
  const container = document.getElementById('price-rules-pages-container');
  if (!container) return;

  let html = '';
  for (let p = 1; p <= totalPages; p++) {
    const activeClass = p === priceRulesCurrentPage ? 'active' : '';
    html += `<button class="page-pill ${activeClass}" onclick="setPriceRulesPage(${p})">${p}</button>`;
  }
  container.innerHTML = html;
}

function setPriceRulesPage(p) {
  priceRulesCurrentPage = p;
  renderPriceRulesTable();
}

function setPriceRulesPerPage(count) {
  priceRulesPerPage = count;
  priceRulesCurrentPage = 1;
  renderPriceRulesTable();
}

function togglePriceRulesFilterPanel() {
  const panel = document.getElementById('price-rules-filter-panel');
  if (!panel) return;
  panel.classList.toggle('hidden');
}

function applyPriceRulesFilters() {
  const searchInput = document.getElementById('price-rules-filter-search');
  const countrySelect = document.getElementById('price-rules-filter-country');
  const categorySelect = document.getElementById('price-rules-filter-category');
  const typeSelect = document.getElementById('price-rules-filter-type');

  priceRulesFilters.search = searchInput ? searchInput.value : '';
  priceRulesFilters.country = countrySelect ? countrySelect.value : '';
  priceRulesFilters.category = categorySelect ? categorySelect.value : '';
  priceRulesFilters.type = typeSelect ? typeSelect.value : '';

  let activeCount = 0;
  if (priceRulesFilters.search) activeCount++;
  if (priceRulesFilters.country) activeCount++;
  if (priceRulesFilters.category) activeCount++;
  if (priceRulesFilters.type) activeCount++;

  const badge = document.getElementById('price-rules-filter-badge');
  if (badge) badge.textContent = activeCount.toString();

  priceRulesCurrentPage = 1;
  renderPriceRulesTable();
}

function clearPriceRulesFilters() {
  const searchInput = document.getElementById('price-rules-filter-search');
  const countrySelect = document.getElementById('price-rules-filter-country');
  const categorySelect = document.getElementById('price-rules-filter-category');
  const typeSelect = document.getElementById('price-rules-filter-type');

  if (searchInput) searchInput.value = '';
  if (countrySelect) countrySelect.value = '';
  if (categorySelect) categorySelect.value = '';
  if (typeSelect) typeSelect.value = '';

  priceRulesFilters = { search: '', country: '', category: '', type: '' };

  const badge = document.getElementById('price-rules-filter-badge');
  if (badge) badge.textContent = '0';

  priceRulesCurrentPage = 1;
  renderPriceRulesTable();
}

function openPriceRuleDetailModal(ruleNum) {
  const rule = PRICE_RULES.find(r => r.rule === ruleNum);
  if (!rule) return;

  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!modal || !content) return;

  content.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">
        <span class="material-symbols-outlined" style="color:#c084fc;">gavel</span>
        Price Rule #${rule.rule} · Details
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="modal-body">
      <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; font-size: 13.5px;">
          <div><span style="color: var(--text-muted); font-size: 12px; display:block;">Country</span><strong>${rule.country}</strong></div>
          <div><span style="color: var(--text-muted); font-size: 12px; display:block;">Category</span><strong>${rule.category}</strong></div>
          <div><span style="color: var(--text-muted); font-size: 12px; display:block;">Size tier</span><strong>${rule.size}</strong></div>
          <div><span style="color: var(--text-muted); font-size: 12px; display:block;">Auditor</span><strong>${rule.auditor}</strong></div>
          <div><span style="color: var(--text-muted); font-size: 12px; display:block;">Sale price (client)</span><strong style="color: #4ade80;">${rule.sale}</strong></div>
          <div><span style="color: var(--text-muted); font-size: 12px; display:block;">Purchase price (auditor)</span><strong style="color: #60a5fa;">${rule.purchase}</strong></div>
        </div>
      </div>

      <div class="modal-field full-width" style="margin-bottom: 14px;">
        <label>Source / Reference Note</label>
        <textarea id="edit-rule-source" class="modal-input" style="min-height: 80px; resize: vertical;">${rule.source}</textarea>
      </div>

      <div style="font-size: 12px; color: var(--text-dim); display: flex; align-items: center; gap: 8px;">
        <span class="material-symbols-outlined" style="font-size: 16px;">history</span>
        Last changed: ${rule.lastChanged}
      </div>
    </div>
    <div class="modal-footer">
      <button class="modal-btn secondary" onclick="closeModal()">Close</button>
      <button class="modal-btn primary" onclick="updatePriceRuleSource(${rule.rule})">
        <span class="material-symbols-outlined" style="font-size:16px;">save</span>
        Save Changes
      </button>
    </div>
  `;

  modal.classList.add('visible');
}

function updatePriceRuleSource(ruleNum) {
  const rule = PRICE_RULES.find(r => r.rule === ruleNum);
  if (!rule) return;

  const noteEl = document.getElementById('edit-rule-source');
  if (noteEl) {
    rule.source = noteEl.value.trim();
    rule.lastChanged = '12 Oct 2026';
  }

  closeModal();
  renderPriceRulesTable();
  showToast('Saved', `Price rule #${ruleNum} has been updated.`, 'success');
}

function openRecordPriceRuleModal() {
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!modal || !content) return;

  const nextRuleNum = PRICE_RULES.length + 1;

  content.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">
        <span class="material-symbols-outlined" style="color:#d4a5d8;">add_box</span>
        Record a price rule
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="modal-body">
      <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
        Define standard, regional or specific audit pricing. Specific rules take precedence over general fallback rates.
      </p>
      <div class="modal-form-grid">
        <div class="modal-field">
          <label>Country</label>
          <select class="modal-input" id="new-pr-country">
            <option value="All countries">All countries</option>
            <option value="Netherlands (NL)">Netherlands (NL)</option>
            <option value="Belgium (BE)">Belgium (BE)</option>
            <option value="Finland (FI)">Finland (FI)</option>
            <option value="Germany (DE)">Germany (DE)</option>
            <option value="France (FR)">France (FR)</option>
          </select>
        </div>
        <div class="modal-field">
          <label>Category</label>
          <select class="modal-input" id="new-pr-category">
            <option value="All categories">All categories</option>
            <option value="Hotels and hostels (HH)">Hotels and hostels (HH)</option>
            <option value="Campsites and holiday parks (CHP)">Campsites and holiday parks (CHP)</option>
            <option value="Conference centres (CC)">Conference centres (CC)</option>
            <option value="Small accommodations (SA)">Small accommodations (SA)</option>
            <option value="Restaurants (R)">Restaurants (R)</option>
            <option value="Attractions (A)">Attractions (A)</option>
          </select>
        </div>
        <div class="modal-field">
          <label>Establishment Size</label>
          <select class="modal-input" id="new-pr-size">
            <option value="All sizes">All sizes</option>
            <option value="Very small, fewer than 5 FTE">Very small, fewer than 5 FTE</option>
            <option value="Small, 6-25 FTE">Small, 6-25 FTE</option>
            <option value="Medium, 26-100 FTE">Medium, 26-100 FTE</option>
            <option value="Large, 101-250 FTE">Large, 101-250 FTE</option>
            <option value="Very large, more than 250 FTE">Very large, more than 250 FTE</option>
          </select>
        </div>
        <div class="modal-field">
          <label>Auditor scope</label>
          <input type="text" class="modal-input" id="new-pr-auditor" value="All auditors" />
        </div>
        <div class="modal-field">
          <label>Pricing model</label>
          <select class="modal-input" id="new-pr-model">
            <option value="lump sum">Lump sum</option>
            <option value="per hour">Per hour</option>
          </select>
        </div>
        <div class="modal-field">
          <label>Sale price (€, excl. VAT)</label>
          <input type="number" class="modal-input" id="new-pr-sale" placeholder="450" />
        </div>
        <div class="modal-field">
          <label>Purchase price (€ to auditor)</label>
          <input type="number" class="modal-input" id="new-pr-purchase" placeholder="300" />
        </div>
        <div class="modal-field full-width">
          <label>Source / Decision rationale</label>
          <input type="text" class="modal-input" id="new-pr-source" placeholder="e.g. Set by Coordinator on 12 Oct 2026 (B-412)" />
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="modal-btn secondary" onclick="closeModal()">Cancel</button>
      <button class="modal-btn primary" onclick="saveNewPriceRule(${nextRuleNum})">
        <span class="material-symbols-outlined" style="font-size:16px;">check</span>
        Record rule
      </button>
    </div>
  `;

  modal.classList.add('visible');
}

function saveNewPriceRule(ruleNum) {
  const country = document.getElementById('new-pr-country')?.value || 'All countries';
  const category = document.getElementById('new-pr-category')?.value || 'All categories';
  const size = document.getElementById('new-pr-size')?.value || 'All sizes';
  const auditor = document.getElementById('new-pr-auditor')?.value || 'All auditors';
  const model = document.getElementById('new-pr-model')?.value || 'lump sum';
  const saleVal = parseFloat(document.getElementById('new-pr-sale')?.value) || 450;
  const purchVal = parseFloat(document.getElementById('new-pr-purchase')?.value) || 300;
  const source = document.getElementById('new-pr-source')?.value.trim() || 'Recorded by Officer on 12 Oct 2026';

  const suffix = model === 'per hour' ? 'per hour' : 'lump sum';
  const saleStr = `EUR ${saleVal.toFixed(2)}, ${suffix}`;
  const purchStr = `EUR ${purchVal.toFixed(2)}, ${suffix}`;

  PRICE_RULES.push({
    rule: ruleNum,
    id: `PR-${String(ruleNum).padStart(3, '0')}`,
    country: country,
    category: category,
    size: size,
    auditor: auditor,
    hours: '—',
    sale: saleStr,
    purchase: purchStr,
    source: source,
    lastChanged: '12 Oct 2026',
    baseRate: saleVal,
    travelEstimate: 120,
    currency: 'EUR',
    active: true
  });

  closeModal();
  renderPriceRulesTable();
  showToast('Recorded', `Price rule #${ruleNum} was recorded.`, 'success');
}

function openMissingPricesModal() {
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!modal || !content) return;

  const missingClasses = [
    { cat: 'Small accommodations (SA)', sizes: ['Very small', 'Small', 'Medium', 'Large', 'Very large'], count: 5 },
    { cat: 'Restaurants (R)', sizes: ['Very small', 'Small', 'Medium', 'Large', 'Very large'], count: 5 },
    { cat: 'Attractions (A)', sizes: ['Very small', 'Small', 'Medium', 'Large', 'Very large'], count: 5 },
    { cat: 'Campsites and holiday parks (CHP)', sizes: ['Large', 'Very large'], count: 2 },
    { cat: 'Conference centres (CC)', sizes: ['Very small', 'Large', 'Very large'], count: 3 }
  ];

  content.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">
        <span class="material-symbols-outlined" style="color:#eab308;">warning</span>
        Where a price is missing (20 of 30 classes)
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="modal-body">
      <div class="price-warning-callout" style="margin-bottom: 20px;">
        <span class="warning-diamond">◆</span>
        <span><strong>20 of 30 not set:</strong> 10 of 30 classes have a price; an audit in the other 20 cannot be priced yet without falling back to the generic hourly rate.</span>
      </div>

      <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 14px;">
        The following establishment categories and size tiers lack accepted standard lump-sum price rules:
      </p>

      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${missingClasses.map(item => `
          <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between;">
            <div>
              <strong style="font-size: 13.5px; color: var(--text-primary);">${item.cat}</strong>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 3px;">
                Missing sizes: ${item.sizes.join(', ')} (${item.count} classes)
              </div>
            </div>
            <button class="action-btn-secondary" style="font-size: 12px; padding: 5px 12px;" onclick="closeModal(); showSettingsPriceList();">
              Open in Price list
            </button>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="modal-btn secondary" onclick="closeModal()">Close</button>
      <button class="modal-btn primary" onclick="closeModal(); openRecordPriceRuleModal();">
        <span class="material-symbols-outlined" style="font-size:16px;">add</span>
        Record rule for missing class
      </button>
    </div>
  `;

  modal.classList.add('visible');
}

function showPriceRulesHelp() {
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!modal || !content) return;

  content.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">
        <span class="material-symbols-outlined" style="color:#d4a5d8;">help_outline</span>
        Price Rules Help & Hierarchy
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="modal-body" style="font-size: 13.5px; line-height: 1.6; color: var(--text-secondary);">
      <p style="margin-bottom: 12px;">
        <strong>How rules are applied:</strong>
        When pricing an audit commission, Audit Independer evaluates price rules from the most specific to the most generic:
      </p>
      <ol style="padding-left: 20px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 6px;">
        <li><strong>Country + Category + Size tier:</strong> E.g., Belgium (BE) Hotels and hostels.</li>
        <li><strong>Generic Category + Size tier:</strong> All countries, standard matrix price list.</li>
        <li><strong>Country Lump-sum:</strong> E.g., Finland (FI) all categories vast.</li>
        <li><strong>Hourly fallback:</strong> Rule #1 (EUR 90.00 / hour sale, EUR 65.00 / hour purchase).</li>
      </ol>
      <p style="margin-bottom: 0;">
        Changes to price rules only apply to newly calculated commissions. Dossiers that already have an accepted locked price retain their existing rates.
      </p>
    </div>
    <div class="modal-footer">
      <button class="modal-btn primary" onclick="closeModal()">Understood</button>
    </div>
  `;

  modal.classList.add('visible');
}

window.renderPriceRulesTable = renderPriceRulesTable;
window.setPriceRulesPage = setPriceRulesPage;
window.setPriceRulesPerPage = setPriceRulesPerPage;
window.togglePriceRulesFilterPanel = togglePriceRulesFilterPanel;
window.applyPriceRulesFilters = applyPriceRulesFilters;
window.clearPriceRulesFilters = clearPriceRulesFilters;
window.openPriceRuleDetailModal = openPriceRuleDetailModal;
window.updatePriceRuleSource = updatePriceRuleSource;
window.openRecordPriceRuleModal = openRecordPriceRuleModal;
window.saveNewPriceRule = saveNewPriceRule;
window.openMissingPricesModal = openMissingPricesModal;
window.showPriceRulesHelp = showPriceRulesHelp;

// ═══════════════════════════════════════════════════════════════════════
// SETTINGS VIEW — Navigation & Rendering
// ═══════════════════════════════════════════════════════════════════════

function showSettingsNav() {
  if (!RBAC.hasPermission('settings.view')) {
    showToast('Geen toegang', 'U heeft geen rechten om de instellingen te bekijken.', 'error');
    return;
  }

  const navWork = document.getElementById('nav-work');
  const navParties = document.getElementById('nav-parties');
  const navWatch = document.getElementById('nav-watch');
  const navSettings = document.getElementById('nav-settings');
  if (navWork) navWork.classList.remove('active');
  if (navParties) navParties.classList.remove('active');
  if (navWatch) navWatch.classList.remove('active');
  if (navSettings) navSettings.classList.add('active');

  const subnavWork = document.getElementById('subnav-work');
  const subnavParties = document.getElementById('subnav-parties');
  const subnavWatch = document.getElementById('subnav-watch');
  const subnavSettings = document.getElementById('subnav-settings');
  if (subnavWork) subnavWork.classList.add('hidden');
  if (subnavParties) subnavParties.classList.add('hidden');
  if (subnavWatch) subnavWatch.classList.add('hidden');
  if (subnavSettings) subnavSettings.classList.remove('hidden');

  showSettingsUsersRoles();
}

function updateSettingsSubnavActive(activeId) {
  const ids = [
    'sub-settings-users',
    'sub-settings-price-list',
    'sub-settings-price-rules',
    'sub-settings-tax-rates',
    'sub-settings-health-safety',
    'sub-settings-form-languages',
    'sub-settings-working-days',
    'sub-settings-assumptions',
    'sub-settings-themes',
    'sub-settings-general'
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === activeId) el.classList.add('active');
      else el.classList.remove('active');
    }
  });
}

function showSettingsHealthSafety() {
  hideAllViews();
  const el = document.getElementById('settings-health-safety-view');
  if (el) el.classList.remove('hidden');
  document.title = 'Audit Independer — Settings · Health and safety: points of attention';
  updateSettingsSubnavActive('sub-settings-health-safety');
  renderHealthSafetyTable();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.showSettingsHealthSafety = showSettingsHealthSafety;

function showSettingsUsersRoles() {
  hideAllViews();
  const el = document.getElementById('settings-users-roles-view');
  if (el) el.classList.remove('hidden');
  document.title = 'Audit Independer — Settings · Users and roles';
  updateSettingsSubnavActive('sub-settings-users');
  renderUsersRolesTable();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.showSettingsUsersRoles = showSettingsUsersRoles;

function showSettingsWorkingDays() {
  hideAllViews();
  const el = document.getElementById('settings-working-days-view');
  if (el) el.classList.remove('hidden');
  document.title = 'Audit Independer — Settings · Working-day calendar';
  updateSettingsSubnavActive('sub-settings-working-days');
  renderCalendarCurrentView();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.showSettingsWorkingDays = showSettingsWorkingDays;

function showSettingsAssumptions() {
  hideAllViews();
  const el = document.getElementById('settings-assumptions-view');
  if (el) el.classList.remove('hidden');
  document.title = 'Audit Independer — Settings · Assumptions';
  updateSettingsSubnavActive('sub-settings-assumptions');
  renderAssumptionsTable();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.showSettingsAssumptions = showSettingsAssumptions;

function showSettingsThemes() {
  hideAllViews();
  const el = document.getElementById('settings-themes-view');
  if (el) el.classList.remove('hidden');
  document.title = 'Audit Independer — Settings · Themes';
  updateSettingsSubnavActive('sub-settings-themes');
  updateThemeControlsUI();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.showSettingsThemes = showSettingsThemes;

function showSettingsPriceList() {
  hideAllViews();
  const el = document.getElementById('settings-price-list-view');
  if (el) el.classList.remove('hidden');
  document.title = 'Audit Independer — Settings · Price list';
  updateSettingsSubnavActive('sub-settings-price-list');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.showSettingsPriceList = showSettingsPriceList;

function switchPriceTab(tab) {
  const tabPrices = document.getElementById('tab-prices');
  const tabCountry = document.getElementById('tab-per-country');
  const tabHistory = document.getElementById('tab-history');
  const matrixContainer = document.getElementById('price-matrix-container');
  const countryView = document.getElementById('price-country-view');
  const historyView = document.getElementById('price-history-view');

  if (tabPrices) tabPrices.classList.toggle('active', tab === 'prices');
  if (tabCountry) tabCountry.classList.toggle('active', tab === 'country');
  if (tabHistory) tabHistory.classList.toggle('active', tab === 'history');

  if (matrixContainer) matrixContainer.classList.toggle('hidden', tab !== 'prices');
  if (countryView) countryView.classList.toggle('hidden', tab !== 'country');
  if (historyView) historyView.classList.toggle('hidden', tab !== 'history');
}
window.switchPriceTab = switchPriceTab;

function downloadPriceSheet() {
  const csvContent = "data:text/csv;charset=utf-8," 
    + "Category,Class,Hours,Price_EUR_Excl_VAT,Auditor_Fee_EUR,Margin_EUR,Status\n"
    + "Hotels and hostels (HH),Very small (<5),5,350,230,120,Active\n"
    + "Hotels and hostels (HH),Small (6-25),7,400,270,130,Active\n"
    + "Hotels and hostels (HH),Medium (26-100),8,450,300,150,Active\n"
    + "Hotels and hostels (HH),Large (101-250),9,500,340,160,Active\n"
    + "Hotels and hostels (HH),Very large (>250),10,550,380,170,Active\n"
    + "Campsites and holiday parks (CHP),Very small (<5),5,350,230,120,Active\n"
    + "Campsites and holiday parks (CHP),Small (6-25),7,400,420,-20,Warning Negative Margin\n"
    + "Campsites and holiday parks (CHP),Medium (26-100),8,450,300,150,Active\n"
    + "Conference centres (CC),Small (6-25),7,400,270,130,Active\n"
    + "Conference centres (CC),Medium (26-100),8,450,300,150,Active\n";

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "Audit_Independer_Price_List_Template.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Download gestart', 'Het spreadsheet Audit_Independer_Price_List_Template.csv is gegenereerd.', 'success');
}
window.downloadPriceSheet = downloadPriceSheet;

function openReadSheetModal() {
  const modal = document.getElementById('modal-content');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return;

  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">
        <span class="material-symbols-outlined" style="color:#a855f7;">upload_file</span>
        Read in a filled-in sheet
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body" style="font-size:14px; line-height:1.6; color:var(--text-secondary);">
      <p style="margin-bottom:14px;">
        Upload hier een ingevulde spreadsheet (.xlsx of .csv) met auditcategorieën, tarieven en auditorkosten.
      </p>
      <div style="border:2px dashed var(--border-strong); border-radius:8px; padding:28px 20px; text-align:center; background:var(--bg-card-subtle); cursor:pointer;" onclick="document.getElementById('sheet-file-input').click()">
        <span class="material-symbols-outlined" style="font-size:36px; color:#a855f7; margin-bottom:8px;">cloud_upload</span>
        <div style="font-weight:600; color:var(--text-primary); margin-bottom:4px;">Klik om spreadsheet te selecteren</div>
        <div style="font-size:12px; color:var(--text-muted);">Ondersteunt .csv en .xlsx bestanden</div>
        <input type="file" id="sheet-file-input" style="display:none;" accept=".csv,.xlsx" onchange="handleSheetUploaded(this.files)" />
      </div>
      <div style="margin-top:14px; font-size:12.5px; color:var(--text-muted); background:rgba(168,85,247,0.08); padding:10px 12px; border-radius:6px; border:1px solid rgba(168,85,247,0.2);">
        Gewijzigde tarieven gelden voor nieuwe commissies; commissies met een reeds geaccepteerd tarief blijven ongewijzigd.
      </div>
    </div>
    <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:10px;">
      <button class="tool-btn" onclick="closeModal()">Annuleren</button>
    </div>
  `;
  overlay.classList.remove('hidden');
}
window.openReadSheetModal = openReadSheetModal;

function handleSheetUploaded(files) {
  if (files && files.length > 0) {
    closeModal();
    showToast('Spreadsheet ingelezen', `Bestand "${files[0].name}" succesvol verwerkt. Tarieven zijn gesynchroniseerd.`, 'success');
  }
}
window.handleSheetUploaded = handleSheetUploaded;

function openEditPriceCell(category, size, currentPrice, currentAuditor) {
  const modal = document.getElementById('modal-content');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return;

  const isSet = currentPrice > 0;
  const initialPrice = isSet ? currentPrice : 400;
  const initialAuditor = isSet ? currentAuditor : 270;
  const initialMargin = initialPrice - initialAuditor;

  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">
        <span class="material-symbols-outlined" style="color:#a855f7;">price_change</span>
        Tarief aanpassen: ${category}
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body" style="font-size:14px; line-height:1.6; color:var(--text-secondary);">
      <div style="margin-bottom:14px; font-weight:600; color:var(--text-primary);">
        Categorie: <span style="color:var(--accent-blue);">${category}</span> · Grootte: <span style="color:var(--accent-blue);">${size}</span>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:16px;">
        <div>
          <label style="display:block; font-size:12.5px; font-weight:600; color:var(--text-muted); margin-bottom:6px;">Standaardtarief vestiging (€ excl. BTW)</label>
          <input type="number" id="edit-price-val" value="${initialPrice}" style="width:100%; padding:9px 12px; border:1px solid var(--border-default); border-radius:6px; background:var(--bg-card); color:var(--text-primary); font-size:15px; font-weight:700;" oninput="recalcMarginPreview()" />
        </div>
        <div>
          <label style="display:block; font-size:12.5px; font-weight:600; color:var(--text-muted); margin-bottom:6px;">Vergoeding auditor (€)</label>
          <input type="number" id="edit-auditor-val" value="${initialAuditor}" style="width:100%; padding:9px 12px; border:1px solid var(--border-default); border-radius:6px; background:var(--bg-card); color:var(--text-primary); font-size:15px; font-weight:700;" oninput="recalcMarginPreview()" />
        </div>
      </div>
      <div style="background:var(--bg-card-subtle); border:1px solid var(--border-subtle); border-radius:6px; padding:12px 16px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:13px; font-weight:600; color:var(--text-secondary);">Berekende certificatiemarge:</span>
        <span id="edit-margin-preview" style="font-size:15px; font-weight:700; color:${initialMargin < 0 ? '#ef4444' : '#10b981'};">
          € ${initialMargin}
        </span>
      </div>
      <div style="font-size:12px; color:var(--text-dim); line-height:1.4;">
        * € 15 voor de self-billing facturatie wordt automatisch ingehouden op het bedrag dat de auditor ontvangt.
      </div>
    </div>
    <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:10px;">
      <button class="tool-btn" onclick="closeModal()">Annuleren</button>
      <button class="tool-btn" style="background:#a855f7; color:#ffffff; border-color:#9333ea; font-weight:600;" onclick="savePriceCellModal('${category}', '${size}')">
        Tarief opslaan
      </button>
    </div>
  `;
  overlay.classList.remove('hidden');
}
window.openEditPriceCell = openEditPriceCell;

function recalcMarginPreview() {
  const p = parseFloat(document.getElementById('edit-price-val').value) || 0;
  const a = parseFloat(document.getElementById('edit-auditor-val').value) || 0;
  const margin = p - a;
  const el = document.getElementById('edit-margin-preview');
  if (el) {
    el.textContent = `€ ${margin}`;
    el.style.color = margin < 0 ? '#ef4444' : '#10b981';
  }
}
window.recalcMarginPreview = recalcMarginPreview;

function savePriceCellModal(category, size) {
  const p = document.getElementById('edit-price-val').value;
  const a = document.getElementById('edit-auditor-val').value;
  closeModal();
  showToast('Tarief bijgewerkt', `${category} (${size}) ingesteld op € ${p} (auditor € ${a}).`, 'success');
}
window.savePriceCellModal = savePriceCellModal;

function showPriceListHelp() {
  const modal = document.getElementById('modal-content');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return;

  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">
        <span class="material-symbols-outlined" style="color:#a855f7;">help_outline</span>
        Over de Prijslijst & Standaardtarieven
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body" style="font-size:14px; line-height:1.6; color:var(--text-secondary);">
      <p style="margin-bottom:12px;">
        <strong>Standaardtarieven voor alle audits:</strong> De prijslijst definieert de basistarieven per vestigingscategorie en capaciteitsgrootte in euro's (excl. BTW) voor alle landen.
      </p>
      <ul style="padding-left:20px; margin-bottom:14px;">
        <li style="margin-bottom:6px;"><strong>Voorrang:</strong> Deze prijzen gelden totdat een auditor zijn eigen goedgekeurde tarieven heeft vastgelegd.</li>
        <li style="margin-bottom:6px;"><strong>Reis- en verblijfkosten:</strong> Komen bovenop deze prijzen, geschat per commissie. Boven € 300 moet de vestiging eerst expliciet akkoord geven.</li>
        <li style="margin-bottom:6px;"><strong>Self-billing:</strong> € 15 voor de automatische self-billing factuur wordt ingehouden op de uiteindelijke uitbetaling aan de auditor.</li>
        <li style="margin-bottom:6px;"><strong>Historiek & geldigheid:</strong> Gewijzigde prijzen gelden voor nieuwe toewijzingen; lopende commissies behouden hun oorspronkelijke prijs.</li>
      </ul>
    </div>
    <div class="modal-footer" style="display:flex; justify-content:flex-end;">
      <button class="tool-btn" style="background:#2563eb; color:#ffffff; border-color:#1d4ed8; font-weight:600;" onclick="closeModal()">Begrepen</button>
    </div>
  `;
  overlay.classList.remove('hidden');
}
window.showPriceListHelp = showPriceListHelp;

function showSettingsPriceRules() {
  hideAllViews();
  const el = document.getElementById('settings-price-rules-view');
  if (el) el.classList.remove('hidden');
  document.title = 'Audit Independer — Settings · Price rules';
  updateSettingsSubnavActive('sub-settings-price-rules');
  renderPriceRulesTable();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.showSettingsPriceRules = showSettingsPriceRules;

// ═══════════════════════════════════════════════════════════════════════
// TAX RATES IN MONEYBIRD — Settings Module
// ═══════════════════════════════════════════════════════════════════════

const MB_TAX_RATES = [
  {
    id: 1,
    invoiceType: 'Invoices to establishments',
    vatTreatment: 'Dutch VAT',
    rate: '21% btw (499501453707053046)',
    confirmed: true,
    confirmedBy: 'Wilco Heijkants',
    confirmedDate: '12 Oct 2026'
  },
  {
    id: 2,
    invoiceType: 'Invoices to establishments',
    vatTreatment: 'Reverse charged within the EU',
    rate: 'Dienst binnen EU (btw verlegd) (500773177488574397)',
    confirmed: true,
    confirmedBy: 'Wilco Heijkants',
    confirmedDate: '12 Oct 2026'
  },
  {
    id: 3,
    invoiceType: 'Invoices to establishments',
    vatTreatment: 'No VAT, outside the EU',
    rate: 'Geen btw (500773177523177407)',
    confirmed: true,
    confirmedBy: 'Wilco Heijkants',
    confirmedDate: '12 Oct 2026'
  },
  {
    id: 4,
    invoiceType: 'Self-billed invoices of auditors',
    vatTreatment: 'Dutch VAT',
    rate: '21% btw (499501454107608233)',
    confirmed: true,
    confirmedBy: 'Wilco Heijkants',
    confirmedDate: '12 Oct 2026'
  },
  {
    id: 5,
    invoiceType: 'Self-billed invoices of auditors',
    vatTreatment: 'Reverse charged within the EU',
    rate: 'Binnen EU 21% (btw verlegd) (500773177599723473)',
    confirmed: true,
    confirmedBy: 'Wilco Heijkants',
    confirmedDate: '12 Oct 2026'
  },
  {
    id: 6,
    invoiceType: 'Self-billed invoices of auditors',
    vatTreatment: 'No VAT, outside the EU',
    rate: 'Buiten EU 21% (btw verlegd) (500773177550440392)',
    confirmed: true,
    confirmedBy: 'Wilco Heijkants',
    confirmedDate: '12 Oct 2026'
  }
];

const MB_LEDGER_ACCOUNTS = [
  {
    id: 1,
    invoiceType: 'Invoices to establishments',
    kind: 'Establishment Fee',
    suggested: 'Omzet Establishment Fee',
    account: 'Not set',
    confirmed: false
  },
  {
    id: 2,
    invoiceType: 'Invoices to establishments',
    kind: 'Licence fee, passed on to the scheme owner',
    suggested: 'Doorbelaste licence fee',
    account: 'Not set',
    confirmed: false
  },
  {
    id: 3,
    invoiceType: 'Invoices to establishments',
    kind: 'Audit Fee',
    suggested: 'Omzet Audit Fee',
    account: 'Not set',
    confirmed: false
  },
  {
    id: 4,
    invoiceType: 'Invoices to establishments',
    kind: 'Travel costs',
    suggested: 'Doorbelaste reiskosten',
    account: 'Not set',
    confirmed: false
  },
  {
    id: 5,
    invoiceType: 'Invoices to establishments',
    kind: 'Stay',
    suggested: 'Doorbelaste verblijfkosten',
    account: 'Not set',
    confirmed: false
  },
  {
    id: 6,
    invoiceType: 'Invoices to establishments',
    kind: 'Other costs',
    suggested: 'Overige omzet',
    account: 'Not set',
    confirmed: false
  },
  {
    id: 7,
    invoiceType: 'Invoices to establishments',
    kind: 'Administration fee (no VAT number)',
    suggested: 'Administratievergoeding',
    account: 'Not set',
    confirmed: false
  },
  {
    id: 8,
    invoiceType: 'Self-billed invoices of auditors',
    kind: 'Audit work of the auditor',
    suggested: 'Inkoop auditwerkzaamheden',
    account: 'Not set',
    confirmed: false
  },
  {
    id: 9,
    invoiceType: 'Self-billed invoices of auditors',
    kind: 'Travel costs of the auditor',
    suggested: 'Reiskosten auditors',
    account: 'Not set',
    confirmed: false
  },
  {
    id: 10,
    invoiceType: 'Self-billed invoices of auditors',
    kind: 'Stay of the auditor',
    suggested: 'Verblijfkosten auditors',
    account: 'Not set',
    confirmed: false
  },
  {
    id: 11,
    invoiceType: 'Self-billed invoices of auditors',
    kind: 'Invoicing costs of the certification body (deducted)',
    suggested: 'Facturatiekosten zelffacturering',
    account: 'Not set',
    confirmed: false
  }
];

let mbLayoutChosen = 'Not set';
let mbWorkflowChosen = 'Not set';
let mbWorkflowSendsNothing = false;

function renderMoneybirdTaxRatesTable() {
  const tbody = document.getElementById('mb-tax-rates-tbody');
  if (!tbody) return;

  tbody.innerHTML = MB_TAX_RATES.map(item => `
    <tr>
      <td style="color: var(--text-primary); font-weight: 500;">${item.invoiceType}</td>
      <td style="color: var(--text-secondary);">${item.vatTreatment}</td>
      <td style="color: ${item.confirmed ? 'var(--text-primary)' : 'var(--text-muted)'}; font-weight: ${item.confirmed ? '500' : '400'};">
        ${item.rate}
      </td>
      <td style="text-align: right;">
        <div style="display: inline-flex; align-items: center; justify-content: flex-end; gap: 12px;">
          ${item.confirmed ? `
            <div style="text-align: right; line-height: 1.35;">
              <div style="font-weight: 600; color: #4ade80; font-size: 12.5px;"><span class="status-dot-green">●</span> Confirmed</div>
              <div style="font-size: 11px; color: var(--text-dim);">by ${item.confirmedBy || 'Wilco Heijkants'} on ${item.confirmedDate || '12 Oct 2026'}</div>
            </div>
          ` : `
            <div style="color: var(--text-muted); font-size: 12px;">Not set</div>
          `}
          <button class="btn-mb-action" onclick="chooseMoneybirdTaxRate(${item.id})">
            Choose a rate
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderMoneybirdLedgerTable() {
  const tbody = document.getElementById('mb-ledger-tbody');
  if (!tbody) return;

  tbody.innerHTML = MB_LEDGER_ACCOUNTS.map(item => `
    <tr>
      <td style="color: var(--text-primary); font-weight: 500;">${item.invoiceType}</td>
      <td>
        <div style="color: var(--text-secondary);">${item.kind}</div>
        <div class="suggested-name">Suggested name: ${item.suggested}</div>
      </td>
      <td style="color: ${item.confirmed ? 'var(--text-primary)' : 'var(--text-muted)'}; font-weight: ${item.confirmed ? '600' : '400'};">
        ${item.account}
      </td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn-mb-action ${item.confirmed ? 'btn-mb-action-primary' : ''}" onclick="chooseMoneybirdLedger(${item.id})" style="margin-right: 6px;">
          ${item.confirmed ? 'Change account' : 'Choose an account'}
        </button>
        ${!item.confirmed ? `<button class="btn-mb-action" onclick="createMoneybirdLedger(${item.id})">Create in Moneybird</button>` : ''}
      </td>
    </tr>
  `).join('');
}

function updateMoneybirdReadyStatuses() {
  // Check Card 2: Tax rates
  const allTaxReady = MB_TAX_RATES.every(r => r.confirmed);
  const pillTax = document.getElementById('mb-pill-tax');
  const noteTax = document.getElementById('mb-note-tax');
  if (pillTax && noteTax) {
    if (allTaxReady) {
      pillTax.className = 'mb-status-pill status-ready';
      pillTax.innerHTML = '<span class="status-dot-green">●</span> Ready';
      noteTax.textContent = 'Every VAT treatment has a confirmed Moneybird rate.';
    } else {
      pillTax.className = 'mb-status-pill status-not-ready';
      pillTax.innerHTML = '<span class="status-diamond-amber">◆</span> Not ready';
      const unconfirmed = MB_TAX_RATES.filter(r => !r.confirmed).map(r => `${r.invoiceType}: ${r.vatTreatment}`).join('; ');
      noteTax.textContent = `Not confirmed: ${unconfirmed}.`;
    }
  }

  // Check Card 3: Ledger accounts
  const allLedgerReady = MB_LEDGER_ACCOUNTS.every(r => r.confirmed);
  const pillLedger = document.getElementById('mb-pill-ledger');
  const noteLedger = document.getElementById('mb-note-ledger');
  if (pillLedger && noteLedger) {
    if (allLedgerReady) {
      pillLedger.className = 'mb-status-pill status-ready';
      pillLedger.innerHTML = '<span class="status-dot-green">●</span> Ready';
      noteLedger.textContent = 'All 11 ledger accounts are confirmed for Moneybird administration.';
    } else {
      pillLedger.className = 'mb-status-pill status-not-ready';
      pillLedger.innerHTML = '<span class="status-diamond-amber">◆</span> Not ready';
      const unconfirmed = MB_LEDGER_ACCOUNTS.filter(r => !r.confirmed).map(r => r.kind).join('; ');
      noteLedger.textContent = `No confirmed ledger account: ${unconfirmed}.`;
    }
  }

  // Check Card 4: Layout
  const pillLayout = document.getElementById('mb-pill-layout');
  const noteLayout = document.getElementById('mb-note-layout');
  const valLayout = document.getElementById('mb-val-layout');
  if (valLayout) valLayout.textContent = mbLayoutChosen;
  if (pillLayout && noteLayout) {
    if (mbLayoutChosen !== 'Not set') {
      pillLayout.className = 'mb-status-pill status-ready';
      pillLayout.innerHTML = '<span class="status-dot-green">●</span> Ready';
      noteLayout.textContent = `Layout chosen: ${mbLayoutChosen}.`;
    } else {
      pillLayout.className = 'mb-status-pill status-not-ready';
      pillLayout.innerHTML = '<span class="status-diamond-amber">◆</span> Not ready';
      noteLayout.textContent = 'No layout is chosen.';
    }
  }

  // Check Card 5: Workflow
  const pillWorkflow = document.getElementById('mb-pill-workflow');
  const noteWorkflow = document.getElementById('mb-note-workflow');
  const valWorkflow = document.getElementById('mb-val-workflow');
  const valWorkflowSends = document.getElementById('mb-val-workflow-sends');
  if (valWorkflow) valWorkflow.textContent = mbWorkflowChosen;
  if (valWorkflowSends) valWorkflowSends.textContent = mbWorkflowSendsNothing ? 'Confirmed: sends nothing' : 'Not set';

  if (pillWorkflow && noteWorkflow) {
    if (mbWorkflowChosen !== 'Not set' && mbWorkflowSendsNothing) {
      pillWorkflow.className = 'mb-status-pill status-ready';
      pillWorkflow.innerHTML = '<span class="status-dot-green">●</span> Ready';
      noteWorkflow.textContent = `Workflow chosen: ${mbWorkflowChosen}. Confirmed it sends nothing automatically.`;
    } else {
      pillWorkflow.className = 'mb-status-pill status-not-ready';
      pillWorkflow.innerHTML = '<span class="status-diamond-amber">◆</span> Not ready';
      if (mbWorkflowChosen === 'Not set') {
        noteWorkflow.textContent = 'No workflow is chosen.';
      } else {
        noteWorkflow.textContent = 'Workflow selected but confirmation that it sends nothing is pending.';
      }
    }
  }
}

function proposeTaxRatesFromMoneybird() {
  MB_TAX_RATES[0].rate = '21% BTW (NL Hoog)';
  MB_TAX_RATES[0].confirmed = true;

  MB_TAX_RATES[1].rate = '0% BTW Verlegd (Diensten binnen EU)';
  MB_TAX_RATES[1].confirmed = true;

  MB_TAX_RATES[2].rate = '0% BTW (Diensten buiten EU)';
  MB_TAX_RATES[2].confirmed = true;

  MB_TAX_RATES[3].rate = '21% BTW (Voorbelasting hoog)';
  MB_TAX_RATES[3].confirmed = true;

  MB_TAX_RATES[4].rate = '0% BTW Verlegd (Inkoop EU)';
  MB_TAX_RATES[4].confirmed = true;

  MB_TAX_RATES[5].rate = '0% BTW (Inkoop buiten EU)';
  MB_TAX_RATES[5].confirmed = true;

  renderMoneybirdTaxRatesTable();
  updateMoneybirdReadyStatuses();
  showToast('Moneybird tarieven voorgesteld', 'Alle 6 BTW-tarieven zijn succesvol gematcht vanuit administratie 499501440123799044.', 'success');
}

function chooseMoneybirdTaxRate(id) {
  const item = MB_TAX_RATES.find(r => r.id === id);
  if (!item) return;

  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!modal || !content) return;

  const sampleRates = [
    '21% btw (499501453707053046)',
    'Dienst binnen EU (btw verlegd) (500773177488574397)',
    'Geen btw (500773177523177407)',
    '21% btw (499501454107608233)',
    'Binnen EU 21% (btw verlegd) (500773177599723473)',
    'Buiten EU 21% (btw verlegd) (500773177550440392)',
    '9% btw (NL Laag)',
    'Geen btw (Vrijgesteld)'
  ];

  content.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">
        <span class="material-symbols-outlined" style="color:#d4a5d8;">percent</span>
        Select Moneybird Tax Rate
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="modal-body">
      <p style="font-size:13px; color:var(--text-muted); margin-bottom:14px;">
        Assign a tax rate from Moneybird administration <strong>499501440123799044</strong> for:
        <br /><strong style="color:var(--text-primary); font-size:14px;">${item.invoiceType} · ${item.vatTreatment}</strong>
      </p>
      <div class="modal-field full-width">
        <label>Available Moneybird Tax Rates</label>
        <select id="select-mb-rate" class="modal-input">
          ${sampleRates.map(r => `<option value="${r}" ${item.rate === r ? 'selected' : ''}>${r}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="modal-btn secondary" onclick="closeModal()">Cancel</button>
      <button class="modal-btn primary" onclick="saveMoneybirdTaxRate(${item.id})">Confirm rate</button>
    </div>
  `;

  modal.classList.add('visible');
}

function saveMoneybirdTaxRate(id) {
  const item = MB_TAX_RATES.find(r => r.id === id);
  if (!item) return;

  const select = document.getElementById('select-mb-rate');
  if (select) {
    item.rate = select.value;
    item.confirmed = true;
    item.confirmedBy = 'Wilco Heijkants';
    item.confirmedDate = '12 Oct 2026';
  }

  closeModal();
  renderMoneybirdTaxRatesTable();
  updateMoneybirdReadyStatuses();
  showToast('Rate confirmed', `BTW-tarief voor ${item.vatTreatment} bevestigd.`, 'success');
}

function proposeLedgerAccountsFromMoneybird() {
  const accountMapping = [
    '8000 Omzet Establishment Fee',
    '8010 Doorbelaste licence fee',
    '8020 Omzet Audit Fee',
    '8030 Doorbelaste reiskosten',
    '8040 Doorbelaste verblijfkosten',
    '8090 Overige omzet',
    '8050 Administratievergoeding',
    '4000 Inkoop auditwerkzaamheden',
    '4010 Reiskosten auditors',
    '4020 Verblijfkosten auditors',
    '4030 Facturatiekosten zelffacturering'
  ];

  MB_LEDGER_ACCOUNTS.forEach((item, index) => {
    item.account = accountMapping[index] || `80${index}0 ${item.suggested}`;
    item.confirmed = true;
  });

  renderMoneybirdLedgerTable();
  updateMoneybirdReadyStatuses();
  showToast('Grootboekrekeningen voorgesteld', 'Alle 11 grootboekrekeningen zijn succesvol gekoppeld aan Moneybird.', 'success');
}

function chooseMoneybirdLedger(id) {
  const item = MB_LEDGER_ACCOUNTS.find(r => r.id === id);
  if (!item) return;

  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!modal || !content) return;

  const accounts = [
    '8000 Omzet Establishment Fee',
    '8010 Doorbelaste licence fee',
    '8020 Omzet Audit Fee',
    '8030 Doorbelaste reiskosten',
    '8040 Doorbelaste verblijfkosten',
    '8050 Administratievergoeding',
    '8090 Overige omzet',
    '4000 Inkoop auditwerkzaamheden',
    '4010 Reiskosten auditors',
    '4020 Verblijfkosten auditors',
    '4030 Facturatiekosten zelffacturering'
  ];

  content.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">
        <span class="material-symbols-outlined" style="color:#d4a5d8;">account_balance</span>
        Select Ledger Account
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="modal-body">
      <p style="font-size:13px; color:var(--text-muted); margin-bottom:14px;">
        Choose ledger account in Moneybird for:
        <br /><strong style="color:var(--text-primary); font-size:14px;">${item.invoiceType} · ${item.kind}</strong>
        <br /><span style="font-size:12px; color:var(--text-dim);">Suggested: ${item.suggested}</span>
      </p>
      <div class="modal-field full-width">
        <label>Available Ledger Accounts</label>
        <select id="select-mb-ledger" class="modal-input">
          ${accounts.map(acc => `<option value="${acc}" ${item.account === acc ? 'selected' : ''}>${acc}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="modal-btn secondary" onclick="closeModal()">Cancel</button>
      <button class="modal-btn primary" onclick="saveMoneybirdLedger(${item.id})">Confirm account</button>
    </div>
  `;

  modal.classList.add('visible');
}

function saveMoneybirdLedger(id) {
  const item = MB_LEDGER_ACCOUNTS.find(r => r.id === id);
  if (!item) return;

  const select = document.getElementById('select-mb-ledger');
  if (select) {
    item.account = select.value;
    item.confirmed = true;
  }

  closeModal();
  renderMoneybirdLedgerTable();
  updateMoneybirdReadyStatuses();
  showToast('Grootboekrekening gekoppeld', `Grootboekrekening voor ${item.kind} bevestigd.`, 'success');
}

function createMoneybirdLedger(id) {
  const item = MB_LEDGER_ACCOUNTS.find(r => r.id === id);
  if (!item) return;

  item.account = `80${item.id}0 ${item.suggested}`;
  item.confirmed = true;

  renderMoneybirdLedgerTable();
  updateMoneybirdReadyStatuses();
  showToast('Aangemaakt in Moneybird', `Grootboekrekening "${item.account}" aangemaakt in administratie 499501440123799044.`, 'success');
}

function chooseMoneybirdLayout() {
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!modal || !content) return;

  const layouts = [
    'Green Key Standaard Factuurlay-out 2026',
    'Audit Independer Huisstijl (Engels / Internationaal)',
    'Standaard Factuurlay-out Moneybird'
  ];

  content.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">
        <span class="material-symbols-outlined" style="color:#d4a5d8;">palette</span>
        Choose Invoice Layout
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="modal-body">
      <p style="font-size:13px; color:var(--text-muted); margin-bottom:14px;">
        Select the layout configured in Moneybird that will be applied to every generated invoice.
      </p>
      <div class="modal-field full-width">
        <label>Available Layouts</label>
        <select id="select-mb-layout" class="modal-input">
          ${layouts.map(l => `<option value="${l}" ${mbLayoutChosen === l ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="modal-btn secondary" onclick="closeModal()">Cancel</button>
      <button class="modal-btn primary" onclick="saveMoneybirdLayout()">Save layout</button>
    </div>
  `;

  modal.classList.add('visible');
}

function saveMoneybirdLayout() {
  const select = document.getElementById('select-mb-layout');
  if (select) {
    mbLayoutChosen = select.value;
  }
  closeModal();
  updateMoneybirdReadyStatuses();
  showToast('Layout gekozen', `Factuurlay-out ingesteld op "${mbLayoutChosen}".`, 'success');
}

function chooseMoneybirdWorkflow() {
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!modal || !content) return;

  const workflows = [
    'Standaard workflow (geen automatische verzending)',
    'Handmatige herinneringen (30 dagen)',
    'Internationale workflow (EUR)'
  ];

  content.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">
        <span class="material-symbols-outlined" style="color:#d4a5d8;">account_tree</span>
        Choose Invoice Workflow
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="modal-body">
      <p style="font-size:13px; color:var(--text-muted); margin-bottom:14px;">
        Choose the Moneybird workflow. Ensure automated reminders are checked by a coordinator.
      </p>
      <div class="modal-field full-width">
        <label>Available Workflows</label>
        <select id="select-mb-workflow" class="modal-input">
          ${workflows.map(w => `<option value="${w}" ${mbWorkflowChosen === w ? 'selected' : ''}>${w}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="modal-btn secondary" onclick="closeModal()">Cancel</button>
      <button class="modal-btn primary" onclick="saveMoneybirdWorkflow()">Save workflow</button>
    </div>
  `;

  modal.classList.add('visible');
}

function saveMoneybirdWorkflow() {
  const select = document.getElementById('select-mb-workflow');
  if (select) {
    mbWorkflowChosen = select.value;
  }
  closeModal();
  updateMoneybirdReadyStatuses();
  showToast('Workflow gekozen', `Workflow ingesteld op "${mbWorkflowChosen}".`, 'success');
}

function confirmWorkflowSendsNothing() {
  mbWorkflowSendsNothing = !mbWorkflowSendsNothing;
  updateMoneybirdReadyStatuses();
  if (mbWorkflowSendsNothing) {
    showToast('Workflow bevestigd', 'Bevestigd: de Moneybird workflow verzendt geen automatische e-mails.', 'success');
  } else {
    showToast('Bevestiging ingetrokken', 'Herinneringsstatus moet opnieuw gecontroleerd worden.', 'info');
  }
}

function runMoneybirdTestInvoice() {
  showToast('Test invoices generated', '3 conceptfacturen succesvol aangemaakt in sandbox administratie 499501440123799044 (NL 21%, EU verlegd, EU non-VAT 21% + 3%).', 'success');
}

function showMoneybirdHelp() {
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!modal || !content) return;

  content.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">
        <span class="material-symbols-outlined" style="color:#d4a5d8;">help_outline</span>
        Moneybird Integration & Tax Rates
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="modal-body" style="font-size:13.5px; line-height:1.6; color:var(--text-secondary);">
      <p style="margin-bottom:12px;">
        <strong>Productie Safeguard:</strong> Op productie kan geen enkele factuur naar Moneybird verzonden worden zolang een van de onderdelen in de "Moneybird ready" checklist niet op <em>Ready</em> staat. Facturen blijven dan wachten op de werklijst met de specifieke blokkerende reden.
      </p>
      <p style="margin-bottom:12px;">
        <strong>BTW & Administratievergoeding (3%):</strong> Voor klanten in de EU en buiten de EU die géén geldig BTW-nummer hebben, wordt automatisch een administratievergoeding van 3% van het factuurbedrag (exclusief BTW) op een aparte factuurregel geplaatst, waarna 21% BTW over het totale bedrag berekend wordt.
      </p>
      <p style="margin-bottom:0;">
        <strong>Zelffacturering Auditors:</strong> Zelffacturen van auditors zonder BTW-nummer worden nooit automatisch uitbetaald; deze worden vastgehouden voor handmatige afhandeling door de administrateur.
      </p>
    </div>
    <div class="modal-footer">
      <button class="modal-btn primary" onclick="closeModal()">Begrepen</button>
    </div>
  `;

  modal.classList.add('visible');
}

function showSettingsTaxRates() {
  hideAllViews();
  const el = document.getElementById('settings-tax-rates-view');
  if (el) el.classList.remove('hidden');
  document.title = 'Audit Independer — Settings · Tax rates in Moneybird';
  updateSettingsSubnavActive('sub-settings-tax-rates');
  renderMoneybirdTaxRatesTable();
  renderMoneybirdLedgerTable();
  updateMoneybirdReadyStatuses();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.renderMoneybirdTaxRatesTable = renderMoneybirdTaxRatesTable;
window.renderMoneybirdLedgerTable = renderMoneybirdLedgerTable;
window.updateMoneybirdReadyStatuses = updateMoneybirdReadyStatuses;
window.proposeTaxRatesFromMoneybird = proposeTaxRatesFromMoneybird;
window.chooseMoneybirdTaxRate = chooseMoneybirdTaxRate;
window.saveMoneybirdTaxRate = saveMoneybirdTaxRate;
window.proposeLedgerAccountsFromMoneybird = proposeLedgerAccountsFromMoneybird;
window.chooseMoneybirdLedger = chooseMoneybirdLedger;
window.saveMoneybirdLedger = saveMoneybirdLedger;
window.createMoneybirdLedger = createMoneybirdLedger;
window.chooseMoneybirdLayout = chooseMoneybirdLayout;
window.saveMoneybirdLayout = saveMoneybirdLayout;
window.chooseMoneybirdWorkflow = chooseMoneybirdWorkflow;
window.saveMoneybirdWorkflow = saveMoneybirdWorkflow;
window.confirmWorkflowSendsNothing = confirmWorkflowSendsNothing;
window.runMoneybirdTestInvoice = runMoneybirdTestInvoice;
window.showMoneybirdHelp = showMoneybirdHelp;
window.showSettingsTaxRates = showSettingsTaxRates;

// ═══════════════════════════════════════════════════════════════════════
// FORM LANGUAGES — Settings Module
// ═══════════════════════════════════════════════════════════════════════

const FORM_LANGUAGES_DATA = [
  { language: 'Français', totalTexts: 620, shownInEnglish: 0, checked: 1, standing: 'Machine translation' },
  { language: 'Español', totalTexts: 620, shownInEnglish: 0, checked: 0, standing: 'Machine translation' },
  { language: 'Português', totalTexts: 620, shownInEnglish: 0, checked: 0, standing: 'Machine translation' },
  { language: 'Deutsch', totalTexts: 620, shownInEnglish: 0, checked: 0, standing: 'Machine translation' }
];

let currentFormLanguage = 'Français';
let formLanguageSearchQuery = '';

const FORM_LANGUAGES_TEXTS = [
  {
    id: 1,
    english: "Guideline",
    translations: {
      'Français': "Recommandé",
      'Español': "Recomendado",
      'Português': "Recomendado",
      'Deutsch': "Empfohlen"
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 2,
    english: "Imperative",
    translations: {
      'Français': "Impératif",
      'Español': "Imperativo",
      'Português': "Imperativo",
      'Deutsch': "Zwingend"
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 3,
    english: "No",
    translations: {
      'Français': "Non",
      'Español': "No",
      'Português': "Não",
      'Deutsch': "Nein"
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 4,
    english: "Not applicable",
    translations: {
      'Français': "Non applicable",
      'Español': "No aplicable",
      'Português': "Não aplicável",
      'Deutsch': "Nicht anwendbar"
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 5,
    english: "Yes",
    translations: {
      'Français': "Oui",
      'Español': "Sí",
      'Português': "Sim",
      'Deutsch': "Ja"
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 6,
    english: "We have proposed ‹auditor› for the audit of ‹establishment›. Please confirm or refuse by ‹due›. A refusal needs a ground; it is not a formality.",
    translations: {
      'Français': "Nous avons proposé ‹auditor› pour l'audit de ‹establishment›. Merci de confirmer ou de refuser avant le ‹due›. Un refus doit être motivé; ce n'est pas une formalité.",
      'Español': "Hemos propuesto ‹auditor› para la auditoría de ‹establishment›. Por favor confirme o rechace antes de ‹due›. Un rechazo requiere motivo; no es una formalidad.",
      'Português': "Propusemos ‹auditor› para a auditoria de ‹establishment›. Por favor confirme ou recuse até ‹due›. A recusa deve ser fundamentada; não é uma formalidade.",
      'Deutsch': "Wir haben ‹auditor› für das Audit von ‹establishment› vorgeschlagen. Bitte bis ‹due› bestätigen oder ablehnen. Eine Ablehnung erfordert eine Begründung."
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 7,
    english: "An auditor has been proposed for your Green Key audit",
    translations: {
      'Français': "Un auditeur a été proposé pour votre audit Green Key",
      'Español': "Se ha propuesto un auditor para su auditoría Green Key",
      'Português': "Um auditor foi proposto para a sua auditoria Green Key",
      'Deutsch': "Ein Auditor wurde für Ihr Green Key Audit vorgeschlagen"
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 8,
    english: "The audit assignment for ‹establishment› is still waiting for a confirmation. The deadline was ‹due›.",
    translations: {
      'Français': "La mission d'audit pour ‹establishment› attend toujours une confirmation. Le délai courait jusqu'au ‹due›.",
      'Español': "La misión de auditoría para ‹establishment› aún está pendiente de confirmación. La fecha límite era ‹due›.",
      'Português': "A atribuição de auditoria para ‹establishment› ainda aguarda confirmação. O prazo terminou a ‹due›.",
      'Deutsch': "Der Auditauftrag für ‹establishment› wartet noch auf Bestätigung. Die Frist war ‹due›."
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 9,
    english: "Reminder: your audit assignment is waiting for you",
    translations: {
      'Français': "Rappel : votre mission d'audit attend votre réponse",
      'Español': "Recordatorio: su asignación de auditoría está esperando su respuesta",
      'Português': "Lembrete: a sua missão de auditoria aguarda a sua resposta",
      'Deutsch': "Erinnerung: Ihr Auditauftrag wartet auf Ihre Antwort"
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 10,
    english: "We have recorded your refusal of ‹auditor› for ‹establishment›, on the ground you gave: ‹ground›.",
    translations: {
      'Français': "Nous avons enregistré votre refus de ‹auditor› pour ‹establishment›, au motif indiqué : ‹ground›.",
      'Español': "Hemos registrado su rechazo de ‹auditor› para ‹establishment›, por el motivo indicado: ‹ground›.",
      'Português': "Registámos a sua recusa de ‹auditor› para ‹establishment› com o motivo indicado: ‹ground›.",
      'Deutsch': "Wir haben Ihre Ablehnung von ‹auditor› für ‹establishment› erfasst: ‹ground›."
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 11,
    english: "Your refusal of the proposed auditor has been recorded",
    translations: {
      'Français': "Votre refus de l'auditeur proposé a été enregistré",
      'Español': "Su rechazo del auditor propuesto ha sido registrado",
      'Português': "A sua recusa do auditor proposto foi registada",
      'Deutsch': "Ihre Ablehnung des vorgeschlagenen Auditors wurde erfasst"
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 12,
    english: "The invoice for ‹establishment› has been drawn up. It is due by ‹due›.",
    translations: {
      'Français': "La facture pour ‹establishment› a été établie. Elle est due avant le ‹due›.",
      'Español': "La factura para ‹establishment› ha sido emitida. Vence el ‹due›.",
      'Português': "A fatura para ‹establishment› foi emitida. Vence em ‹due›.",
      'Deutsch': "Die Rechnung für ‹establishment› wurde erstellt. Sie ist fällig bis ‹due›."
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 13,
    english: "Invoice for your Green Key certification",
    translations: {
      'Français': "Facture pour votre certification Green Key",
      'Español': "Factura de su certificación Green Key",
      'Português': "Fatura da sua certificação Green Key",
      'Deutsch': "Rechnung für Ihre Green Key Zertifizierung"
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 14,
    english: "The payment for ‹establishment› has not reached us. It is due by ‹due›, and the audit cannot be held before it has.",
    translations: {
      'Français': "Le paiement pour ‹establishment› ne nous est pas parvenu. Il est dû avant le ‹due›, et l'audit ne peut avoir lieu avant.",
      'Español': "El pago para ‹establishment› no ha llegado. Vence el ‹due› y la auditoría no puede realizarse antes.",
      'Português': "O pagamento para ‹establishment› não foi recebido. Vence a ‹due› e a auditoria não pode realizar-se antes.",
      'Deutsch': "Die Zahlung für ‹establishment› ist nicht eingegangen. Fällig bis ‹due›; das Audit kann vorher nicht stattfinden."
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 15,
    english: "Reminder: payment is due before the audit",
    translations: {
      'Français': "Rappel : le paiement est dû avant l'audit",
      'Español': "Recordatorio: el pago debe realizarse antes de la auditoría",
      'Português': "Lembrete: o pagamento deve ser feito antes da auditoria",
      'Deutsch': "Erinnerung: Zahlung ist vor dem Audit fällig"
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 16,
    english: "The audit of ‹establishment› is confirmed for ‹audit date›. What should be ready on the day is described in the preparation instruction.",
    translations: {
      'Français': "L'audit de ‹establishment› est confirmé pour le ‹audit date›. Les éléments à préparer sont décrits dans l'instruction de préparation.",
      'Español': "La auditoría de ‹establishment› está confirmada para el ‹audit date›. Lo que debe estar listo se detalla en la instrucción.",
      'Português': "A auditoria de ‹establishment› está confirmada para ‹audit date›. O que deve estar preparado consta da instrução.",
      'Deutsch': "Das Audit von ‹establishment› ist für den ‹audit date› bestätigt. Die Vorbereitungen sind in der Anweisung beschrieben."
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 17,
    english: "Your audit is confirmed",
    translations: {
      'Français': "Votre audit est confirmé",
      'Español': "Su auditoría está confirmada",
      'Português': "A sua auditoria está confirmada",
      'Deutsch': "Ihr Audit ist bestätigt"
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 18,
    english: "The draft report for ‹establishment› is ready. You may respond until ‹due›.",
    translations: {
      'Français': "Le projet de rapport pour ‹establishment› est prêt. Vous pouvez réagir jusqu'au ‹due›.",
      'Español': "El borrador de informe para ‹establishment› está listo. Puede responder hasta el ‹due›.",
      'Português': "O rascunho do relatório de ‹establishment› está pronto. Pode responder até ‹due›.",
      'Deutsch': "Der Berichtsentwurf für ‹establishment› ist fertig. Sie können bis zum ‹due› Stellung nehmen."
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 19,
    english: "The draft audit report is ready for your response",
    translations: {
      'Français': "Le projet de rapport d'audit attend votre réaction",
      'Español': "El borrador de informe de auditoría está listo para sus comentarios",
      'Português': "O rascunho do relatório de auditoria aguarda a sua resposta",
      'Deutsch': "Der Auditberichtsentwurf wartet auf Ihre Rückmeldung"
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 20,
    english: "The audit of ‹establishment› found non-conformities. They are to be rectified by ‹due›.",
    translations: {
      'Français': "L'audit de ‹establishment› a relevé des non-conformités. Elles doivent être corrigées avant le ‹due›.",
      'Español': "La auditoría de ‹establishment› encontró no conformidades. Deben corregirse antes de ‹due›.",
      'Português': "A auditoria de ‹establishment› detetou não conformidades. Devem ser corrigidas até ‹due›.",
      'Deutsch': "Beim Audit von ‹establishment› wurden Abweichungen festgestellt. Diese sind bis ‹due› zu beheben."
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 21,
    english: "Non-conformities to be rectified",
    translations: {
      'Français': "Non-conformités à corriger",
      'Español': "No conformidades a corregir",
      'Português': "Não conformidades a corrigir",
      'Deutsch': "Zu behebende Nichtkonformitäten"
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 22,
    english: "The audit of ‹establishment› found more than five non-conformities, so a follow-up on-site audit is required, at the expense of the establishment.",
    translations: {
      'Français': "L'audit de ‹establishment› a relevé plus de cinq non-conformités; un audit sur site complémentaire est requis, aux frais de l'établissement.",
      'Español': "La auditoría encontró más de cinco no conformidades; se requiere auditoría complementaria.",
      'Português': "A auditoria detetou mais de cinco não conformidades; auditoria complementar necessária.",
      'Deutsch': "Mehr als fünf Nichtkonformitäten festgestellt; Nachaudit vor Ort erforderlich."
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 23,
    english: "A follow-up on-site audit will be scheduled",
    translations: {
      'Français': "Un audit sur site complémentaire sera programmé",
      'Español': "Se programará una auditoría complementaria en el sitio",
      'Português': "Será agendada uma auditoria complementar no local",
      'Deutsch': "Ein Vor-Ort-Nachaudit wird geplant"
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 24,
    english: "The certification body has decided: ‹outcome›. The grounds are: ‹grounds›. You may appeal this decision. Get in touch with the certification body: it writes the appeal down and has it decided by somebody who was not involved in the decision it is about.",
    translations: {
      'Français': "L'organisme de certification a décidé : ‹outcome›. Les motifs sont : ‹grounds›. Vous pouvez faire appel de cette décision. Prenez contact avec l'organisme de certification : il consigne l'appel et le fait trancher par une personne qui n'a pas participé à la décision concernée.",
      'Español': "El organismo de certificación ha decidido: ‹outcome›. Los motivos son: ‹grounds›. Puede apelar esta decisión comunicándose con el organismo.",
      'Português': "O organismo de certificação decidiu: ‹outcome›. Os fundamentos são: ‹grounds›. Pode recorrer desta decisão contactando o organismo.",
      'Deutsch': "Die Zertifizierungsstelle hat entschieden: ‹outcome›. Begründung: ‹grounds›. Sie können Beschwerde einlegen."
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 25,
    english: "The certification decision for ‹establishment›",
    translations: {
      'Français': "Décision de certification pour ‹establishment›",
      'Español': "Decisión de certificación para ‹establishment›",
      'Português': "Decisão de certificação para ‹establishment›",
      'Deutsch': "Zertifizierungsentscheidung für ‹establishment›"
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 26,
    english: "The surveillance of ‹establishment› is due. Its window runs to ‹due›. We ask for the updated figures and an updated action plan.",
    translations: {
      'Français': "La surveillance de ‹establishment› est due. Sa fenêtre court jusqu'au ‹due›. Nous demandons les données actualisées et un plan d'action mis à jour.",
      'Español': "La vigilancia de ‹establishment› vence el ‹due›. Solicitamos datos actualizados y plan de acción.",
      'Português': "A vigilância de ‹establishment› vence a ‹due›. Solicitamos dados e plano de ação atualizados.",
      'Deutsch': "Die Überwachung von ‹establishment› ist fällig bis ‹due›. Wir bitten um aktuelle Zahlen."
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 27,
    english: "Surveillance: we need your updated figures",
    translations: {
      'Français': "Surveillance : nous avons besoin de vos données actualisées",
      'Español': "Vigilancia: necesitamos sus cifras actualizadas",
      'Português': "Vigilância: precisamos dos seus números atualizados",
      'Deutsch': "Überwachung: wir benötigen Ihre aktualisierten Zahlen"
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 28,
    english: "Accept this audit",
    translations: {
      'Français': "Accepter cet audit",
      'Español': "Aceptar esta auditoría",
      'Português': "Aceitar esta auditoria",
      'Deutsch': "Dieses Audit annehmen"
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 29,
    english: "Decline",
    translations: {
      'Français': "Décliner",
      'Español': "Rechazar",
      'Português': "Recusar",
      'Deutsch': "Ablehnen"
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 30,
    english: "I have no conflict of interest with this establishment.",
    translations: {
      'Français': "Je n'ai aucun conflit d'intérêts avec cet établissement.",
      'Español': "No tengo ningún conflicto de intereses con este establecimiento.",
      'Português': "Não tenho nenhum conflito de interesses com este estabelecimento.",
      'Deutsch': "Ich habe keinen Interessenkonflikt mit diesem Betrieb."
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 31,
    english: "Your fee: ‹purchase› minus the fixed ‹deduction› of the self-billed invoice = ‹fee›",
    translations: {
      'Français': "Votre rémunération : ‹purchase› moins les ‹deduction› fixes de l'autofacturation = ‹fee›",
      'Español': "Su honorario: ‹purchase› menos los ‹deduction› fijos de la autofactura = ‹fee›",
      'Português': "A sua remuneração: ‹purchase› menos os ‹deduction› fixos da autofaturação = ‹fee›",
      'Deutsch': "Ihre Vergütung: ‹purchase› abzüglich fester ‹deduction› der Gutschrift = ‹fee›"
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 32,
    english: "Assessment ID: ‹assessment id›",
    translations: {
      'Français': "Assessment ID : ‹assessment id›",
      'Español': "ID de evaluación: ‹assessment id›",
      'Português': "ID de avaliação: ‹assessment id›",
      'Deutsch': "Bewertungs-ID: ‹assessment id›"
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 33,
    english: "Done: the auditor has access",
    translations: {
      'Français': "Fait : l'auditeur a accès",
      'Español': "Hecho: el auditor tiene acceso",
      'Português': "Concluído: o auditor tem acesso",
      'Deutsch': "Erledigt: Auditor hat Zugriff"
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 34,
    english: "What is the problem?",
    translations: {
      'Français': "Quel est le problème ?",
      'Español': "¿Cuál es el problema?",
      'Português': "Qual é o problema?",
      'Deutsch': "Was ist das Problem?"
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  },
  {
    id: 35,
    english: "There is a problem",
    translations: {
      'Français': "Il y a un problème",
      'Español': "Hay un problema",
      'Português': "Há um problema",
      'Deutsch': "Es gibt ein Problem"
    },
    checked: { 'Français': true, 'Español': false, 'Português': false, 'Deutsch': false }
  }
];

function formatFLVariables(str) {
  if (!str) return '';
  return str.replace(/‹([^›]+)›/g, '<span class="fl-string-var">‹$1›</span>');
}

function renderFormLanguagesOverview() {
  const tbody = document.getElementById('fl-overview-tbody');
  if (!tbody) return;

  // Recalculate checked counts
  FORM_LANGUAGES_DATA.forEach(row => {
    const checkedCount = FORM_LANGUAGES_TEXTS.filter(t => t.checked[row.language]).length;
    row.checked = checkedCount;
  });

  tbody.innerHTML = FORM_LANGUAGES_DATA.map(row => `
    <tr>
      <td style="font-weight: 600; color: var(--text-primary);">${row.language}</td>
      <td style="color: var(--text-secondary);">${row.totalTexts}</td>
      <td style="color: var(--text-muted);">${row.shownInEnglish}</td>
      <td style="color: ${row.checked > 0 ? '#4ade80' : 'var(--text-muted)'}; font-weight: ${row.checked > 0 ? '600' : '400'};">
        ${row.checked}
      </td>
      <td style="text-align: right; color: var(--text-muted);">${row.standing}</td>
    </tr>
  `).join('');
}

function renderFormLanguagesTexts() {
  const tbody = document.getElementById('fl-translations-tbody');
  const counterEl = document.getElementById('fl-counter-text');
  if (!tbody) return;

  const query = (formLanguageSearchQuery || '').toLowerCase().trim();
  const filtered = FORM_LANGUAGES_TEXTS.filter(item => {
    if (!query) return true;
    const trans = item.translations[currentFormLanguage] || '';
    return item.english.toLowerCase().includes(query) || trans.toLowerCase().includes(query);
  });

  if (counterEl) {
    if (query) {
      counterEl.textContent = `Showing ${filtered.length} texts of 620 matching "${query}".`;
    } else {
      counterEl.textContent = `Showing ${Math.min(100, filtered.length)} texts of 620. Type in the search field to find another.`;
    }
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: center; padding: 36px; color: var(--text-muted);">
          No translation texts match "${query}".
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const isChecked = !!(item.checked && item.checked[currentFormLanguage]);
    const transText = item.translations[currentFormLanguage] || item.english;

    return `
      <tr>
        <td style="color: var(--text-primary); line-height: 1.55;">
          ${formatFLVariables(item.english)}
        </td>
        <td style="color: var(--text-secondary); line-height: 1.55;">
          ${formatFLVariables(transText)}
        </td>
        <td style="text-align: right; white-space: nowrap;">
          ${isChecked ? `
            <span class="native-speaker-checked" onclick="toggleNativeSpeakerCheck(${item.id})" title="Click to uncheck">
              <span class="status-dot-green">●</span> Checked
            </span>
          ` : `
            <button class="btn-mark-checked" onclick="toggleNativeSpeakerCheck(${item.id})">
              Mark as checked
            </button>
          `}
        </td>
      </tr>
    `;
  }).join('');
}

function changeFormLanguagesTargetLang(lang) {
  currentFormLanguage = lang;
  renderFormLanguagesOverview();
  renderFormLanguagesTexts();
}

function filterFormLanguagesTexts() {
  const input = document.getElementById('fl-search-input');
  formLanguageSearchQuery = input ? input.value : '';
  renderFormLanguagesTexts();
}

function toggleNativeSpeakerCheck(textId) {
  const item = FORM_LANGUAGES_TEXTS.find(t => t.id === textId);
  if (!item) return;

  const currentVal = !!item.checked[currentFormLanguage];
  item.checked[currentFormLanguage] = !currentVal;

  renderFormLanguagesOverview();
  renderFormLanguagesTexts();

  if (item.checked[currentFormLanguage]) {
    showToast('Marked as checked', `Text #${textId} marked as verified by a native speaker (${currentFormLanguage}).`, 'success');
  } else {
    showToast('Check removed', `Text #${textId} is no longer marked as verified (${currentFormLanguage}).`, 'info');
  }
}

function showFormLanguagesHelp() {
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!modal || !content) return;

  content.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">
        <span class="material-symbols-outlined" style="color:#d4a5d8;">translate</span>
        Form Languages Policy
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="modal-body" style="font-size:13.5px; line-height:1.6; color:var(--text-secondary);">
      <p style="margin-bottom:12px;">
        <strong>English is leading:</strong> The master copy of every string and email template is written and maintained in English. All business logic, variables (such as ‹establishment›, ‹auditor›, ‹due›), and criteria rules derive from English.
      </p>
      <p style="margin-bottom:12px;">
        <strong>Service languages:</strong> French, Spanish, Portuguese and German are provided as a service to establishment managers and auditors.
      </p>
      <p style="margin-bottom:0;">
        <strong>Native speaker verification:</strong> Texts generated via machine translation can be audited and marked as <em>Checked</em> by a certified native speaker to guarantee quality.
      </p>
    </div>
    <div class="modal-footer">
      <button class="modal-btn primary" onclick="closeModal()">Begrepen</button>
    </div>
  `;

  modal.classList.add('visible');
}

function showSettingsFormLanguages() {
  hideAllViews();
  const el = document.getElementById('settings-form-languages-view');
  if (el) el.classList.remove('hidden');
  document.title = 'Audit Independer — Settings · Form languages';
  updateSettingsSubnavActive('sub-settings-form-languages');
  renderFormLanguagesOverview();
  renderFormLanguagesTexts();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.renderFormLanguagesOverview = renderFormLanguagesOverview;
window.renderFormLanguagesTexts = renderFormLanguagesTexts;
window.changeFormLanguagesTargetLang = changeFormLanguagesTargetLang;
window.filterFormLanguagesTexts = filterFormLanguagesTexts;
window.toggleNativeSpeakerCheck = toggleNativeSpeakerCheck;
window.showFormLanguagesHelp = showFormLanguagesHelp;
window.showSettingsFormLanguages = showSettingsFormLanguages;

function showSettingsGeneral() {
  hideAllViews();
  const el = document.getElementById('settings-general-view');
  if (el) el.classList.remove('hidden');
  document.title = 'Audit Independer — Settings · General';
  updateSettingsSubnavActive('sub-settings-general');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.showSettingsGeneral = showSettingsGeneral;

// ─── Settings Data & Visual Calendar Engine ───
let calCurrentMonth = 9; // 0-based: 9 = Oktober
let calCurrentYear = 2026;
let calViewMode = 'month'; // 'month', 'year', 'list'

const DUTCH_MONTH_NAMES = [
  'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'
];

const KNOWN_HOLIDAYS = {
  // 2026
  '2026-01-01': { name: "Nieuwjaarsdag", type: 'statutory', assumed: 'No', source: 'Algemene termijnenwet art. 3' },
  '2026-04-03': { name: "Goede Vrijdag", type: 'assumed', assumed: 'Assumed — the board decides', source: 'Algemene termijnenwet art. 3' },
  '2026-04-05': { name: "Eerste Paasdag", type: 'statutory', assumed: 'No', source: 'Algemene termijnenwet art. 3' },
  '2026-04-06': { name: "Tweede Paasdag", type: 'statutory', assumed: 'No', source: 'Algemene termijnenwet art. 3' },
  '2026-04-27': { name: "Koningsdag", type: 'statutory', assumed: 'No', source: 'Algemene termijnenwet art. 3' },
  '2026-05-05': { name: "Bevrijdingsdag", type: 'assumed', assumed: 'Assumed — the board decides', source: 'Algemene termijnenwet art. 3' },
  '2026-05-14': { name: "Hemelvaartsdag", type: 'statutory', assumed: 'No', source: 'Algemene termijnenwet art. 3' },
  '2026-05-24': { name: "Eerste Pinksterdag", type: 'statutory', assumed: 'No', source: 'Algemene termijnenwet art. 3' },
  '2026-05-25': { name: "Tweede Pinksterdag", type: 'statutory', assumed: 'No', source: 'Algemene termijnenwet art. 3' },
  '2026-12-25': { name: "Eerste Kerstdag", type: 'statutory', assumed: 'No', source: 'Algemene termijnenwet art. 3' },
  '2026-12-26': { name: "Tweede Kerstdag", type: 'statutory', assumed: 'No', source: 'Algemene termijnenwet art. 3' },
  // 2019 baseline (as in screenshot)
  '2019-01-01': { name: "New Year's Day", type: 'statutory', assumed: 'No', source: 'Algemene termijnenwet art. 3' },
  '2019-04-19': { name: "Good Friday", type: 'assumed', assumed: 'Assumed — the board decides', source: 'Algemene termijnenwet art. 3' },
  '2019-04-22': { name: "Easter Monday", type: 'statutory', assumed: 'No', source: 'Algemene termijnenwet art. 3' },
  '2019-04-27': { name: "King's Day", type: 'statutory', assumed: 'No', source: 'Algemene termijnenwet art. 3' },
  '2019-05-05': { name: "Liberation Day", type: 'assumed', assumed: 'Assumed — the board decides', source: 'Algemene termijnenwet art. 3' },
  '2019-05-30': { name: "Ascension Day", type: 'statutory', assumed: 'No', source: 'Algemene termijnenwet art. 3' },
  '2019-06-10': { name: "Whit Monday", type: 'statutory', assumed: 'No', source: 'Algemene termijnenwet art. 3' },
  '2019-12-25': { name: "Christmas Day", type: 'statutory', assumed: 'No', source: 'Algemene termijnenwet art. 3' }
};

const ALL_WORKING_DAYS = [
  { date: '1 Jan 2019', day: "New Year's Day", assumed: 'No', workingValue: 'As the source says', source: 'Algemene termijnenwet art. 3' },
  { date: '19 Apr 2019', day: 'Good Friday', assumed: 'Assumed — the board decides', workingValue: 'As the source says', source: 'Algemene termijnenwet art. 3' },
  { date: '22 Apr 2019', day: 'Easter Monday', assumed: 'No', workingValue: 'As the source says', source: 'Algemene termijnenwet art. 3' },
  { date: '27 Apr 2019', day: "King's Day", assumed: 'No', workingValue: 'As the source says', source: 'Algemene termijnenwet art. 3' },
  { date: '5 May 2019', day: 'Liberation Day', assumed: 'Assumed — the board decides', workingValue: 'As the source says', source: 'Algemene termijnenwet art. 3' },
  { date: '30 May 2019', day: 'Ascension Day', assumed: 'No', workingValue: 'As the source says', source: 'Algemene termijnenwet art. 3' },
  { date: '10 Jun 2019', day: 'Whit Monday', assumed: 'No', workingValue: 'As the source says', source: 'Algemene termijnenwet art. 3' },
  { date: '25 Dec 2019', day: 'Christmas Day', assumed: 'No', workingValue: 'As the source says', source: 'Algemene termijnenwet art. 3' },
  { date: '1 Jan 2026', day: "Nieuwjaarsdag", assumed: 'No', workingValue: 'As the source says', source: 'Algemene termijnenwet art. 3' },
  { date: '3 Apr 2026', day: 'Goede Vrijdag', assumed: 'Assumed — the board decides', workingValue: 'As the source says', source: 'Algemene termijnenwet art. 3' },
  { date: '6 Apr 2026', day: 'Tweede Paasdag', assumed: 'No', workingValue: 'As the source says', source: 'Algemene termijnenwet art. 3' },
  { date: '27 Apr 2026', day: "Koningsdag", assumed: 'No', workingValue: 'As the source says', source: 'Algemene termijnenwet art. 3' },
  { date: '5 May 2026', day: 'Bevrijdingsdag', assumed: 'Assumed — the board decides', workingValue: 'As the source says', source: 'Algemene termijnenwet art. 3' },
  { date: '14 May 2026', day: 'Hemelvaartsdag', assumed: 'No', workingValue: 'As the source says', source: 'Algemene termijnenwet art. 3' },
  { date: '25 May 2026', day: 'Tweede Pinksterdag', assumed: 'No', workingValue: 'As the source says', source: 'Algemene termijnenwet art. 3' },
  { date: '25 Dec 2026', day: 'Eerste Kerstdag', assumed: 'No', workingValue: 'As the source says', source: 'Algemene termijnenwet art. 3' },
  { date: '26 Dec 2026', day: 'Tweede Kerstdag', assumed: 'No', workingValue: 'As the source says', source: 'Algemene termijnenwet art. 3' }
];

function setCalendarViewMode(mode) {
  calViewMode = mode;

  // Toggle button active classes
  const btnMonth = document.getElementById('btn-mode-month');
  const btnYear = document.getElementById('btn-mode-year');
  const btnList = document.getElementById('btn-mode-list');
  if (btnMonth) btnMonth.classList.toggle('active', mode === 'month');
  if (btnYear) btnYear.classList.toggle('active', mode === 'year');
  if (btnList) btnList.classList.toggle('active', mode === 'list');

  // Toggle view containers
  const cMonth = document.getElementById('cal-month-view-container');
  const cYear = document.getElementById('cal-year-view-container');
  const cList = document.getElementById('cal-list-view-container');
  if (cMonth) cMonth.classList.toggle('hidden', mode !== 'month');
  if (cYear) cYear.classList.toggle('hidden', mode !== 'year');
  if (cList) cList.classList.toggle('hidden', mode !== 'list');

  renderCalendarCurrentView();
}
window.setCalendarViewMode = setCalendarViewMode;

function renderCalendarCurrentView() {
  if (calViewMode === 'month') {
    renderMonthCalendarGrid();
  } else if (calViewMode === 'year') {
    renderYearCalendarGrid();
  } else if (calViewMode === 'list') {
    renderWorkingDaysTable();
  }
}
window.renderCalendarCurrentView = renderCalendarCurrentView;

function navigateCalendarMonth(delta) {
  calCurrentMonth += delta;
  if (calCurrentMonth < 0) {
    calCurrentMonth = 11;
    calCurrentYear -= 1;
  } else if (calCurrentMonth > 11) {
    calCurrentMonth = 0;
    calCurrentYear += 1;
  }
  renderCalendarCurrentView();
}
window.navigateCalendarMonth = navigateCalendarMonth;

function setCalendarMonth(month, year) {
  calCurrentMonth = month;
  if (year) calCurrentYear = year;
  calViewMode = 'month';
  setCalendarViewMode('month');
}
window.setCalendarMonth = setCalendarMonth;

function jumpToCalendarToday() {
  calCurrentMonth = 9; // Oktober 2026 (current simulation date)
  calCurrentYear = 2026;
  calViewMode = 'month';
  setCalendarViewMode('month');
  showToast('Vandaag', 'Teruggekeerd naar huidige datum (8 oktober 2026).', 'info');
}
window.jumpToCalendarToday = jumpToCalendarToday;

function renderMonthCalendarGrid() {
  const container = document.getElementById('cal-days-grid-elem');
  const monthLabel = document.getElementById('cal-month-label');
  const monthBadge = document.getElementById('cal-month-badge');
  if (!container) return;

  if (monthLabel) {
    monthLabel.textContent = `${DUTCH_MONTH_NAMES[calCurrentMonth]} ${calCurrentYear}`;
  }

  if (monthBadge) {
    if (calCurrentMonth === 9 && calCurrentYear === 2026) {
      monthBadge.textContent = 'Huidige maand';
      monthBadge.style.display = 'inline-block';
    } else {
      const q = Math.floor(calCurrentMonth / 3) + 1;
      monthBadge.textContent = `Kwartaal ${q}`;
      monthBadge.style.display = 'inline-block';
    }
  }

  // Update quick pills active states
  document.querySelectorAll('.cal-quick-pill').forEach(pill => {
    pill.classList.remove('active');
  });

  const daysInMonth = new Date(calCurrentYear, calCurrentMonth + 1, 0).getDate();
  const firstDayIndex = new Date(calCurrentYear, calCurrentMonth, 1).getDay();
  // Monday is 0, Sunday is 6
  const startOffset = (firstDayIndex + 6) % 7;
  const prevMonthDays = new Date(calCurrentYear, calCurrentMonth, 0).getDate();

  let cellsHtml = '';

  // Previous month trailing days
  for (let i = startOffset - 1; i >= 0; i--) {
    const dayNum = prevMonthDays - i;
    cellsHtml += `
      <div class="cal-day-cell is-outside-month">
        <div class="cal-day-top-row">
          <span class="cal-day-number">${dayNum}</span>
        </div>
      </div>
    `;
  }

  // Current month days
  let currentMonthWorkdays = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(calCurrentYear, calCurrentMonth, day);
    const dayOfWeek = (dateObj.getDay() + 6) % 7; // 0=Mon..6=Sun
    const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
    const isToday = day === 8 && calCurrentMonth === 9 && calCurrentYear === 2026;

    const dateKey = `${calCurrentYear}-${String(calCurrentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const holiday = KNOWN_HOLIDAYS[dateKey];
    const isHoliday = !!holiday;
    const isAssumed = holiday && holiday.type === 'assumed';

    if (!isWeekend && !isHoliday) {
      currentMonthWorkdays++;
    }

    let holidayHtml = '';
    if (isHoliday) {
      holidayHtml = `
        <div class="cal-holiday-pill">
          <span class="cal-holiday-title">${holiday.name}</span>
          <span class="cal-holiday-badge">${isAssumed ? 'Assumed (Bestuur)' : 'Wettelijk erkend'}</span>
        </div>
      `;
    }

    let dayTypeLabel = 'Werkdag';
    if (isHoliday) dayTypeLabel = isAssumed ? 'Bestuursbesluit' : 'Wettelijke feestdag';
    else if (isWeekend) dayTypeLabel = 'Weekend';

    cellsHtml += `
      <div class="cal-day-cell ${isWeekend ? 'is-weekend' : ''} ${isHoliday ? 'is-holiday' : ''} ${isAssumed ? 'is-assumed' : ''} ${isToday ? 'is-today' : ''}" onclick="openDayDetailModal(${day}, ${calCurrentMonth}, ${calCurrentYear})">
        <div class="cal-day-top-row">
          <span class="cal-day-number">${day}</span>
          <span class="cal-day-type-tag">${dayTypeLabel}</span>
        </div>
        ${holidayHtml}
        <div class="cal-day-footer-row">
          <span>${isWeekend || isHoliday ? 'Niet-werkdag' : 'Telt voor SLA'}</span>
          ${isToday ? '<span style="color:#2563eb; font-weight:700;">● Vandaag</span>' : ''}
        </div>
      </div>
    `;
  }

  // Next month trailing days to complete full grid
  const totalSlots = startOffset + daysInMonth;
  const remainingSlots = (7 - (totalSlots % 7)) % 7;
  for (let nextDay = 1; nextDay <= remainingSlots; nextDay++) {
    cellsHtml += `
      <div class="cal-day-cell is-outside-month">
        <div class="cal-day-top-row">
          <span class="cal-day-number">${nextDay}</span>
        </div>
      </div>
    `;
  }

  container.innerHTML = cellsHtml;

  // Update stat banner if in current month
  const statWorkdays = document.getElementById('cal-stat-workdays');
  if (statWorkdays && calCurrentYear === 2026) {
    statWorkdays.textContent = `254 dagen (${currentMonthWorkdays} in ${DUTCH_MONTH_NAMES[calCurrentMonth].toLowerCase()})`;
  }
}
window.renderMonthCalendarGrid = renderMonthCalendarGrid;

function renderYearCalendarGrid() {
  const container = document.getElementById('cal-year-view-container');
  if (!container) return;

  let yearHtml = '';
  for (let m = 0; m < 12; m++) {
    const daysInM = new Date(calCurrentYear, m + 1, 0).getDate();
    let holidaysInM = [];
    let workdaysInM = 0;

    for (let d = 1; d <= daysInM; d++) {
      const dObj = new Date(calCurrentYear, m, d);
      const dow = (dObj.getDay() + 6) % 7;
      const key = `${calCurrentYear}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const hol = KNOWN_HOLIDAYS[key];
      if (hol) {
        holidaysInM.push({ day: d, ...hol });
      } else if (dow < 5) {
        workdaysInM++;
      }
    }

    const holidaysListHtml = holidaysInM.length > 0
      ? holidaysInM.map(h => `
          <div class="cal-mini-holiday-item ${h.type === 'assumed' ? 'assumed' : 'statutory'}">
            <span><strong>${h.day} ${DUTCH_MONTH_NAMES[m].slice(0, 3)}:</strong> ${h.name}</span>
            <span style="font-size:10px; text-transform:uppercase;">${h.type === 'assumed' ? 'Assumed' : 'Wettelijk'}</span>
          </div>
        `).join('')
      : `<div style="font-size:12px; color:var(--text-muted); font-style:italic;">Geen feestdagen in deze maand</div>`;

    yearHtml += `
      <div class="cal-mini-month-card" onclick="setCalendarMonth(${m}, ${calCurrentYear})">
        <div class="cal-mini-header">
          <span class="cal-mini-name">${DUTCH_MONTH_NAMES[m]}</span>
          <span class="cal-mini-stats">${workdaysInM} werkdagen</span>
        </div>
        <div class="cal-mini-holidays-list">
          ${holidaysListHtml}
        </div>
      </div>
    `;
  }

  container.innerHTML = yearHtml;
}
window.renderYearCalendarGrid = renderYearCalendarGrid;

function openDayDetailModal(day, month, year) {
  const modal = document.getElementById('modal-content');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return;

  const dateObj = new Date(year, month, day);
  const dayOfWeek = (dateObj.getDay() + 6) % 7;
  const isWeekend = dayOfWeek >= 5;
  const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const holiday = KNOWN_HOLIDAYS[dateKey];
  const dateFormatted = dateObj.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  let statusBadge = `<span class="card-header-badge success">Werkbare dag</span>`;
  let description = `Deze dag telt als een officiële werkdag voor termijnen, auditplanning en reactietijden van vestigingen.`;

  if (holiday) {
    if (holiday.type === 'assumed') {
      statusBadge = `<span class="card-header-badge warning">Assumed · Bestuursbesluit</span>`;
      description = `<strong>${holiday.name}</strong> is gelijkgesteld aan een feestdag op grond van een formeel bestuursbesluit. Termijnen worden opgeschort conform de Algemene termijnenwet art. 3.`;
    } else {
      statusBadge = `<span class="card-header-badge error">Wettelijke Feestdag</span>`;
      description = `<strong>${holiday.name}</strong> is een wettelijk erkende feestdag. Termijnen die op deze dag eindigen worden van rechtswege verlengd naar de eerstvolgende werkdag.`;
    }
  } else if (isWeekend) {
    statusBadge = `<span class="card-header-badge muted">Weekenddag</span>`;
    description = `Zaterdag en zondag tellen niet mee voor wettelijke auditbeoordelingstermijnen.`;
  }

  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">
        <span class="material-symbols-outlined" style="color:#2563eb;">calendar_today</span>
        ${dateFormatted}
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="modal-body">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
        <span style="font-size:13px; color:var(--text-muted); font-weight:600; text-transform:uppercase;">Kwalificatie</span>
        ${statusBadge}
      </div>

      <div style="padding:14px; background:var(--bg-card-subtle); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); font-size:13.5px; line-height:1.55; color:var(--text-secondary); margin-bottom:1.25rem;">
        ${description}
      </div>

      <div style="font-size:13px; color:var(--text-muted); display:flex; flex-direction:column; gap:6px;">
        <div><strong>Wettelijke grondslag:</strong> ${holiday ? holiday.source : 'Algemene termijnenwet art. 3'}</div>
        <div><strong>SLA Audit Impact:</strong> ${holiday || isWeekend ? 'Verlengt audittermijn met +1 werkdag' : 'Gewone termijndag (telt mee)'}</div>
      </div>
    </div>
    <div class="modal-footer" style="display:flex; justify-content:space-between; align-items:center; padding:1rem 1.5rem; border-top:1px solid var(--border-subtle); background:var(--bg-card-header);">
      <button class="tool-btn" onclick="openRecordBoardDecisionModal();">
        <span class="material-symbols-outlined" style="font-size:16px;">gavel</span>
        Bestuursbesluit vastleggen
      </button>
      <button class="tool-btn" style="background:#2563eb; color:#ffffff; border-color:#1d4ed8;" onclick="closeModal()">Sluiten</button>
    </div>
  `;

  overlay.classList.add('visible');
}
window.openDayDetailModal = openDayDetailModal;

function renderWorkingDaysTable(items = ALL_WORKING_DAYS) {
  const tbody = document.getElementById('working-days-tbody');
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-muted);">Geen werkdagen of feestdagen gevonden voor deze zoekopdracht.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(d => {
    const isAssumed = d.assumed.includes('Assumed');
    const assumedHtml = isAssumed
      ? `<span style="font-style:italic; color:var(--text-muted);">${d.assumed}</span>`
      : `<span>${d.assumed}</span>`;

    return `
      <tr>
        <td style="font-weight:600; color:var(--text-primary);">${d.date}</td>
        <td style="font-weight:500;">${d.day}</td>
        <td>${assumedHtml}</td>
        <td style="color:var(--text-secondary);">${d.workingValue}</td>
        <td style="color:var(--text-muted); font-size:13px;">${d.source}</td>
      </tr>
    `;
  }).join('');
}
window.renderWorkingDaysTable = renderWorkingDaysTable;

function filterWorkingDaysTable() {
  const query = (document.getElementById('working-days-search')?.value || '').toLowerCase().trim();
  if (!query) {
    renderWorkingDaysTable(ALL_WORKING_DAYS);
    return;
  }
  const filtered = ALL_WORKING_DAYS.filter(d =>
    d.date.toLowerCase().includes(query) ||
    d.day.toLowerCase().includes(query) ||
    d.assumed.toLowerCase().includes(query) ||
    d.source.toLowerCase().includes(query)
  );
  renderWorkingDaysTable(filtered);
}
window.filterWorkingDaysTable = filterWorkingDaysTable;

// ─── THE 15 OFFICIAL ASSUMPTIONS (EXACT APPLICATION DATA) ───
const ALL_ASSUMPTIONS = [
  {
    mark: 'AS-1',
    subject: 'From which refusal of a proposed auditor a dossier escalates',
    holds: '2',
    comesFrom: 'The source says «repeated refusal» and gives no figure. Read as «more than once». Policy of the certification body.',
    answer: 'Not yet answered: on Waiting for management.',
    detail: 'Wanneer een vestiging herhaaldelijk een voorgestelde auditor weigert zonder gegronde motivering (bijv. aantoonbaar belangenconflict), escaleert het dossier direct naar de Certificatiecommissie voor bindende besluitvorming.'
  },
  {
    mark: 'AS-2',
    subject: 'Who must do the refresher training after a criteria change',
    holds: 'Whoever was already competent at publication',
    comesFrom: 'The source says within six months of publication but not for whom. Whoever becomes competent afterwards was assessed against the set that then applies.',
    answer: 'Not yet answered: on Waiting for management.',
    detail: 'Bestaande geaccrediteerde auditors dienen binnen 6 maanden na publicatie van nieuwe criteriaversies een verplichte opfrismodule te voltooien.'
  },
  {
    mark: 'AS-3',
    subject: 'Which status holds when an establishment is in more than one category',
    holds: 'The strictest',
    comesFrom: 'Paragraph 3.1 says how the status lies per category and is silent on two. The strictest is the safe side: judging more strictly than intended cannot be held against a certification body, judging more leniently can. For the fee the same question IS answered — the highest rate.',
    answer: 'Not yet answered: on Waiting for management.',
    detail: 'Indien een vestiging zowel hotel- als restaurantfaciliteiten aanbiedt (HH + RES), geldt voor auditcriteria en kwalificatiedrempels te allen tijde de strengste norm.'
  },
  {
    mark: 'AS-4',
    subject: 'Whether every criterion requires evidence',
    holds: 'Yes, unless a criterion says otherwise',
    comesFrom: 'The published explanatory notes carry «Audit evidence» for every criterion (counted). That it is therefore always obligatory is our step, not the scheme owner\'s. Overridable per criterion.',
    answer: 'Not yet answered: on Waiting for management.',
    detail: 'Voor ieder afzonderlijk Green Key criterium moet fysiek of digitaal verificatiebewijs (facturen, logs, foto’s) in het dossier worden gedocumenteerd.'
  },
  {
    mark: 'AS-5',
    subject: 'What the yearly anniversary is when the agreement started on 29 February',
    holds: '1 March',
    comesFrom: 'The agreement says «the recurring anniversary of the Effective Date» and says nothing about a date that does not exist in three years out of four. Held so that it never bills earlier than a full year after the last one: invoicing a day early is harder to defend than a day late.',
    answer: 'Not yet answered: on Waiting for management.',
    detail: 'Voor overeenkomsten afgesloten in een schrikkeljaar op 29 februari geldt in gewone jaren 1 maart als vaste verjaardatum voor facturatie en surveillance termijnen.'
  },
  {
    mark: 'AS-6',
    subject: 'How long a personal portal link stays valid, in days',
    holds: '14',
    comesFrom: 'Policy of the certification body; the sources name no figure. An invitation whose link has expired is never sent: a person issues a new one.',
    answer: 'Not yet answered: on Waiting for management.',
    detail: 'Persoonlijke toegangstokens en uitnodigingslinks voor vestigingsmanagers en contactpersonen vervallen automatisch na 14 kalenderdagen.'
  },
  {
    mark: 'AS-7',
    subject: 'The clock of the follow-up decision after a conditional certification (gate check 12)',
    holds: '30 working days',
    comesFrom: 'The follow-up decision is a second moment of review with a clock of its own, from the receipt of the additional evidence. The source does not reconcile the three months with the review term; our reading. A term row.',
    answer: 'Not yet answered: on Waiting for management.',
    detail: 'Na ontvangst van aanvullend bewijs bij een voorwaardelijke certificering beschikt het certificatieorgaan over 30 werkdagen om de definitieve beslissing te formaliseren.'
  },
  {
    mark: 'AS-8',
    subject: 'The cycle after a decision on the transitional route (§ 6F)',
    holds: 'Transitional review (§ 6F) · Certification body decides on continued conformity: does not run on this route · Establishment delivers its surveillance material: does not run on this route · On-site audit performed: does not run on this route · Scheme owner forwards the surveillance material to the certification body: does not run on this route · Surveillance performed: does not run on this route',
    comesFrom: 'No surveillance window fits in a certificate of twelve months, and the encouragement to recertify keeps the same distance before expiry as in the ordinary cycle. The source says nothing about the cycle after such a decision; our reading. The rows of the route, by name.',
    answer: 'Not yet answered: on Waiting for management.',
    detail: 'Bij overgangsroutes vervalt het reguliere surveillanceraster wegens de beperkte 12-maands geldigheid; volledige hercertificering volgt het standaardritme.'
  },
  {
    mark: 'AS-9',
    subject: 'The shape of the external key the import couples on',
    holds: 'Daily snapshot of establishments: /^GK\\d+$/ · Planning export of 15 September 2026: /^GK\\d+$/ · FEE export of 9 September 2026: /^GK\\d+$/ · National Operator forms: /^GK\\d{5}$/ · Export of scheme owner: /^\\S+$/',
    comesFrom: 'A row per import source. Seen in two deliveries and not confirmed by the scheme owner; our reading. Never in code: another scheme does not use this shape.',
    answer: 'Not yet answered: on Waiting for management.',
    detail: 'Importbestanden valideren Green Key identifiers aan de hand van gestandaardiseerde regex patronen per bronlijst (zoals 5-cijferige of variabele nummering).'
  },
  {
    mark: 'AS-10',
    subject: 'The thresholds at which a planned window is called critical',
    holds: 'certification, before window opens: 3 months · before window closes: 1 month · surveillance, before window opens: 28 calendar days · before window closes: 14 calendar days',
    comesFrom: 'No source names a figure; our first filling-in. A row per scheme and kind of assessment, and every row carries its own ground, which says it is a first filling-in and not a confirmed figure.',
    answer: 'Not yet answered: on Waiting for management.',
    detail: 'Kritieke drempels triggeren visuele waarschuwingspulsen in de Watch lijst en automatische herinneringen naar planners.'
  },
  {
    mark: 'AS-11',
    subject: 'How long the contact details of a national operator\'s people are kept',
    holds: '2 years',
    comesFrom: 'No source names a period; our reading, the same line as for an establishment. Counted per contact person, from the earlier of the end of the relation with the operator and the moment the person is no longer a contact; earlier values kept after a change count from the change. Policy of the certification body, so the board can change it.',
    answer: 'Answered where the value lives, from Waiting for management.',
    detail: 'Contactgegevens van vertegenwoordigers van nationale operators worden tot 2 jaar na beëindiging van het contact bewaard en daarna gearchiveerd.'
  },
  {
    mark: 'VL-A3',
    subject: 'The term for the audit report',
    holds: '10 working days',
    comesFrom: 'On the verification list of 6 August 2026 and not yet answered; the standard is held until it is. A term row.',
    answer: 'Not yet answered: on Waiting for management.',
    detail: 'De auditor heeft maximaal 10 werkdagen na de inspectiedag om het volledige bevindingenrapport in te dienen.'
  },
  {
    mark: 'VL-A5',
    subject: 'Who numbers the establishment',
    holds: 'A design rule, with no value to turn round.',
    comesFrom: 'On the verification list of 6 August 2026 and not yet answered. The scheme reference leads and this system makes no numbering of its own. A design rule: there is no value to turn round, only the rule that nothing in code or data generates a second number.',
    answer: 'Not yet answered: on Waiting for management.',
    detail: 'Audit Independer genereert geen eigen vestigingsnummers; het Green Key ID van de schema-eigenaar is te allen tijde leidend en uniek.'
  },
  {
    mark: 'VL-B5',
    subject: 'The languages at go-live',
    holds: 'de: 8 files · en: 48 files · es: 8 files · fr: 8 files · pt: 8 files · vendor: no files',
    comesFrom: 'On the verification list: English and French — French a choice of Audit Independer, not of the scheme. What is shown here is what the system carries: its language folders and their files.',
    answer: 'Not yet answered: on Waiting for management.',
    detail: 'Het platform ondersteunt meertalige dossiersets; Engels en Frans zijn primair geconfigureerd voor de actieve certificatiepool.'
  },
  {
    mark: 'Calendar',
    subject: 'The days of the working-day calendar that carry «assumed»',
    holds: '44 days carry «assumed»: Good Friday, Liberation Day',
    comesFrom: 'The client confirmed the calendar, not its days; they were filled in from the Algemene termijnenwet, article 3, as an assumption in data. A day wrongly held free makes an alert come too late, so in doubt a day is left out. The decision of the board on such a day is recorded on Working-day calendar.',
    answer: 'Answered where the value lives, from Waiting for management.',
    detail: 'Goede Vrijdag en Bevrijdingsdag worden standaard als aanname beschouwd totdat een expliciet bestuursbesluit per kalenderjaar wordt gedeponeerd.'
  }
];

const expandedAssumptions = new Set();

function toggleAssumptionRow(mark) {
  if (expandedAssumptions.has(mark)) {
    expandedAssumptions.delete(mark);
  } else {
    expandedAssumptions.add(mark);
  }
  renderAssumptionsTable();
}
window.toggleAssumptionRow = toggleAssumptionRow;

function renderAssumptionsTable() {
  const tbody = document.getElementById('assumptions-tbody');
  if (!tbody) return;

  tbody.innerHTML = ALL_ASSUMPTIONS.map(a => {
    const isExpanded = expandedAssumptions.has(a.mark);
    const isAnswered = a.answer.startsWith('Answered');
    const answerBadge = isAnswered
      ? `<span style="color:#10b981; font-weight:600;"><span class="assumption-caret">▶</span>${a.answer}</span>`
      : `<span class="assumption-unanswered"><span class="assumption-caret">▶</span>${a.answer}</span>`;

    const mainRow = `
      <tr class="assumption-row ${isExpanded ? 'expanded' : ''}" onclick="toggleAssumptionRow('${a.mark}')">
        <td><span class="assumption-mark">${a.mark}</span></td>
        <td>
          <span class="assumption-caret">▶</span>
          <span style="font-weight:600; color:var(--text-primary);">${a.subject}</span>
        </td>
        <td>
          <span class="assumption-caret">▶</span>
          <span style="font-weight:500;">${a.holds}</span>
        </td>
        <td style="color:var(--text-secondary); font-size:13.5px;">
          <span class="assumption-caret">▶</span>
          <span>${a.comesFrom}</span>
        </td>
        <td>
          ${answerBadge}
        </td>
      </tr>
    `;

    const detailRow = isExpanded ? `
      <tr class="assumption-details-row">
        <td colspan="5">
          <div class="assumption-details-content">
            <div style="font-weight:700; color:var(--text-primary); margin-bottom:4px;">Toelichting & Protocol:</div>
            <div>${a.detail}</div>
            <div style="margin-top:8px; display:flex; gap:10px;">
              <button class="tool-btn" style="height:30px; font-size:12px; padding:0 10px;" onclick="event.stopPropagation(); showToast('Vraag verstuurd', 'Herinnering voor goedkeuring aanname ${a.mark} verzonden naar het management.', 'success');">
                <span class="material-symbols-outlined" style="font-size:15px;">send</span>
                Herinnering naar management sturen
              </button>
            </div>
          </div>
        </td>
      </tr>
    ` : '';

    return mainRow + detailRow;
  }).join('');
}
window.renderAssumptionsTable = renderAssumptionsTable;


// ═══════════════════════════════════════════════════════════════════════
// MY THEME ENGINE (5 PRESETS, MODES, TEXT SIZES & PERSONAL STUDIO)
// ═══════════════════════════════════════════════════════════════════════

const THEME_PRESETS = {
  'calm': { name: 'Calm', desc: 'The house style: navy on ivory. Quiet and familiar.', defaultAccent: '#1d4ed8', defaultAccentName: 'Independer Blauw' },
  'petrol': { name: 'Petrol', desc: 'Fresh blue-green. Calm, with a little more colour.', defaultAccent: '#0d9488', defaultAccentName: 'Petrol Groenblauw' },
  'aubergine': { name: 'Aubergine', desc: 'Warm and a little bolder.', defaultAccent: '#7c3aed', defaultAccentName: 'Aubergine Paars' },
  'graphite': { name: 'Graphite', desc: 'Grey and black. Colour only where you can click.', defaultAccent: '#2563eb', defaultAccentName: 'Graphite Leisteen' },
  'high-contrast': { name: 'High contrast', desc: 'Black on white. For bright light or tired eyes.', defaultAccent: '#0000ee', defaultAccentName: 'Hoog Contrast Blauw' }
};

let currentThemePalette = localStorage.getItem('audit_theme_palette') || 'calm';
let currentThemeMode = localStorage.getItem('audit_independer_theme_pref') || 'dark';
let currentTextSize = localStorage.getItem('audit_theme_text_size') || 'normal';
let currentCustomAccent = localStorage.getItem('audit_custom_accent_hex') || null;
let currentCustomAccentName = localStorage.getItem('audit_custom_accent_name') || null;

function initUserTheme() {
  selectThemePreset(currentThemePalette, false);
  setThemeMode(currentThemeMode, false);
  setTextSize(currentTextSize, false);
  if (currentCustomAccent) {
    applyCustomAccentCSS(currentCustomAccent, currentCustomAccentName || 'Aangepast');
  } else {
    const preset = THEME_PRESETS[currentThemePalette] || THEME_PRESETS.calm;
    applyCustomAccentCSS(preset.defaultAccent, preset.defaultAccentName);
  }
}

function selectThemePreset(presetKey, showNotification = true) {
  if (!THEME_PRESETS[presetKey]) presetKey = 'calm';
  currentThemePalette = presetKey;
  localStorage.setItem('audit_theme_palette', presetKey);
  
  document.documentElement.setAttribute('data-palette', presetKey);
  
  // Update Cards UI
  document.querySelectorAll('.theme-preset-card').forEach(card => {
    if (card.dataset.preset === presetKey) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });
  
  // Update status text
  const nameElem = document.getElementById('theme-active-name');
  if (nameElem) nameElem.textContent = THEME_PRESETS[presetKey].name;
  
  const noteElem = document.getElementById('theme-status-note');
  if (noteElem) {
    noteElem.innerHTML = `You follow the default: <strong id="theme-active-name">${THEME_PRESETS[presetKey].name}</strong>.`;
  }

  const preset = THEME_PRESETS[presetKey];
  if (preset) {
    currentCustomAccent = preset.defaultAccent;
    currentCustomAccentName = preset.defaultAccentName;
    applyCustomAccentCSS(preset.defaultAccent, preset.defaultAccentName);
  }
  
  if (showNotification) {
    showToast('Thema geselecteerd', `Thema "${THEME_PRESETS[presetKey].name}" geactiveerd.`, 'info');
  }
}

function setThemeMode(mode, showNotification = true) {
  currentThemeMode = mode;
  localStorage.setItem('audit_independer_theme_pref', mode);
  
  let resolvedMode = mode;
  if (mode === 'auto') {
    resolvedMode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  
  document.documentElement.setAttribute('data-theme', resolvedMode);
  localStorage.setItem('audit_independer_theme', resolvedMode);
  
  // Update segmented control buttons
  const lightBtn = document.getElementById('seg-mode-light');
  const darkBtn = document.getElementById('seg-mode-dark');
  const autoBtn = document.getElementById('seg-mode-auto');
  if (lightBtn) lightBtn.classList.toggle('active', mode === 'light');
  if (darkBtn) darkBtn.classList.toggle('active', mode === 'dark');
  if (autoBtn) autoBtn.classList.toggle('active', mode === 'auto');
  
  // Update avatar dropdown quick buttons
  const quickLight = document.getElementById('btn-quick-light');
  const quickDark = document.getElementById('btn-quick-dark');
  const quickAuto = document.getElementById('btn-quick-auto');
  if (quickLight) quickLight.classList.toggle('active', mode === 'light');
  if (quickDark) quickDark.classList.toggle('active', mode === 'dark');
  if (quickAuto) quickAuto.classList.toggle('active', mode === 'auto');
  
  // Legacy toggle icon & text
  const icon = document.getElementById('theme-toggle-icon');
  const text = document.getElementById('theme-toggle-text');
  if (icon) icon.textContent = resolvedMode === 'dark' ? 'light_mode' : 'dark_mode';
  if (text) text.textContent = resolvedMode === 'dark' ? 'Light mode' : 'Dark mode';
  
  if (showNotification) {
    const label = mode === 'auto' ? 'Systeemvoorkeur' : (mode === 'dark' ? 'Donker' : 'Licht');
    showToast('Weergavemodus aangepast', `${label} thema actief.`, 'info');
  }
}

function setTextSize(size, showNotification = true) {
  currentTextSize = size;
  localStorage.setItem('audit_theme_text_size', size);
  document.documentElement.setAttribute('data-text-size', size);
  
  const smallerBtn = document.getElementById('seg-size-smaller');
  const normalBtn = document.getElementById('seg-size-normal');
  const largerBtn = document.getElementById('seg-size-larger');
  if (smallerBtn) smallerBtn.classList.toggle('active', size === 'smaller');
  if (normalBtn) normalBtn.classList.toggle('active', size === 'normal');
  if (largerBtn) largerBtn.classList.toggle('active', size === 'larger');
  
  // Real-time update in live preview box
  const previewBox = document.querySelector('.customizer-preview-box');
  const previewBtn = document.querySelector('.customizer-preview-box .preview-btn');
  const previewHdr = document.querySelector('.customizer-preview-box .preview-table-header');
  const previewBody = document.querySelector('.customizer-preview-box .preview-table-body');
  const previewPill = document.querySelector('.customizer-preview-box .preview-pill');
  const previewBadge = document.querySelector('.customizer-preview-box .status-badge.surveillance');

  if (previewBox) {
    if (size === 'smaller') {
      previewBox.style.padding = '12px';
      if (previewBtn) { previewBtn.style.fontSize = '11.5px'; previewBtn.style.padding = '5px 12px'; }
      if (previewPill) { previewPill.style.fontSize = '10px'; previewPill.style.padding = '2px 7px'; }
      if (previewBadge) { previewBadge.style.fontSize = '10px'; previewBadge.style.padding = '2px 7px'; }
      if (previewHdr) { previewHdr.style.fontSize = '11px'; }
      if (previewBody) { previewBody.style.fontSize = '10.5px'; }
    } else if (size === 'larger') {
      previewBox.style.padding = '24px';
      if (previewBtn) { previewBtn.style.fontSize = '15.5px'; previewBtn.style.padding = '10px 20px'; }
      if (previewPill) { previewPill.style.fontSize = '13.5px'; previewPill.style.padding = '4px 12px'; }
      if (previewBadge) { previewBadge.style.fontSize = '13px'; previewBadge.style.padding = '4px 12px'; }
      if (previewHdr) { previewHdr.style.fontSize = '14.5px'; }
      if (previewBody) { previewBody.style.fontSize = '13.5px'; }
    } else { // normal
      previewBox.style.padding = '18px';
      if (previewBtn) { previewBtn.style.fontSize = '13.5px'; previewBtn.style.padding = '8px 16px'; }
      if (previewPill) { previewPill.style.fontSize = '12px'; previewPill.style.padding = '3px 10px'; }
      if (previewBadge) { previewBadge.style.fontSize = '11.5px'; previewBadge.style.padding = '3px 10px'; }
      if (previewHdr) { previewHdr.style.fontSize = '12.5px'; }
      if (previewBody) { previewBody.style.fontSize = '12px'; }
    }
  }

  if (showNotification) {
    const labels = { smaller: 'Aa Kleiner', normal: 'Aa Normaal', larger: 'Aa Groter' };
    showToast('Tekstgrootte gewijzigd', `${labels[size] || size} toegepast.`, 'info');
  }
}

function applyCustomAccentCSS(hex, name) {
  // Store and set standard root variables
  document.documentElement.style.setProperty('--accent-blue', hex);
  document.documentElement.style.setProperty('--border-focus', hex);

  // Compute a darker/brighter tone for hover & alpha variants
  let r = 29, g = 78, b = 216;
  if (/^#([0-9a-f]{6})$/i.test(hex)) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  }
  const hoverR = Math.max(0, Math.min(255, Math.round(r * 0.85)));
  const hoverG = Math.max(0, Math.min(255, Math.round(g * 0.85)));
  const hoverB = Math.max(0, Math.min(255, Math.round(b * 0.85)));
  const hoverHex = `#${hoverR.toString(16).padStart(2, '0')}${hoverG.toString(16).padStart(2, '0')}${hoverB.toString(16).padStart(2, '0')}`;
  document.documentElement.style.setProperty('--accent-blue-hover', hoverHex);

  // Set surveillance badge / highlight vars across theme
  document.documentElement.style.setProperty('--status-surveillance-bg', `rgba(${r}, ${g}, ${b}, 0.16)`);
  document.documentElement.style.setProperty('--status-surveillance-border', `rgba(${r}, ${g}, ${b}, 0.4)`);
  document.documentElement.style.setProperty('--status-surveillance-text', hex);

  // Update swatches active state
  document.querySelectorAll('.accent-swatch').forEach(sw => {
    const swColor = sw.getAttribute('style') || '';
    if (swColor.toLowerCase().includes(hex.toLowerCase())) {
      sw.classList.add('active');
    } else {
      sw.classList.remove('active');
    }
  });
  
  const picker = document.getElementById('custom-accent-picker');
  if (picker && picker.value.toLowerCase() !== hex.toLowerCase()) {
    try { picker.value = hex; } catch (e) {}
  }
  
  const nameEl = document.getElementById('custom-accent-name');
  if (nameEl) nameEl.textContent = name || hex;

  // DIRECT REAL-TIME UPDATE FOR LIVE PREVIEW BOX
  const previewBtn = document.querySelector('.customizer-preview-box .preview-btn');
  if (previewBtn) {
    previewBtn.style.setProperty('background', hex, 'important');
    previewBtn.style.setProperty('border-color', hoverHex, 'important');
    previewBtn.style.setProperty('box-shadow', `0 4px 14px rgba(${r}, ${g}, ${b}, 0.45)`, 'important');
  }

  const previewBadge = document.querySelector('.customizer-preview-box .status-badge.surveillance');
  if (previewBadge) {
    previewBadge.style.setProperty('color', hex, 'important');
    previewBadge.style.setProperty('background', `rgba(${r}, ${g}, ${b}, 0.18)`, 'important');
    previewBadge.style.setProperty('border-color', `rgba(${r}, ${g}, ${b}, 0.48)`, 'important');
  }

  const previewPill = document.querySelector('.customizer-preview-box .preview-pill');
  if (previewPill) {
    previewPill.style.borderLeft = `3px solid ${hex}`;
  }

  const previewTable = document.querySelector('.customizer-preview-box .preview-sample-table');
  if (previewTable) {
    previewTable.style.setProperty('border-left', `4px solid ${hex}`, 'important');
  }

  const previewTag = document.querySelector('.customizer-preview-box .preview-table-header span:last-child');
  if (previewTag) {
    previewTag.style.setProperty('color', hex, 'important');
  }

  const pickerWrap = document.querySelector('.accent-picker-wrap');
  if (pickerWrap) {
    pickerWrap.style.borderColor = hex;
  }
}

function setCustomAccent(hex, name, showNotification = true) {
  currentCustomAccent = hex;
  currentCustomAccentName = name;
  localStorage.setItem('audit_custom_accent_hex', hex);
  localStorage.setItem('audit_custom_accent_name', name);
  
  applyCustomAccentCSS(hex, name);
  if (showNotification) {
    showToast('Accentkleur ingesteld', `Accentkleur gewijzigd naar "${name}".`, 'success');
  }
}

function resetThemeToDefault() {
  localStorage.removeItem('audit_theme_palette');
  localStorage.removeItem('audit_independer_theme_pref');
  localStorage.removeItem('audit_theme_text_size');
  localStorage.removeItem('audit_custom_accent_hex');
  localStorage.removeItem('audit_custom_accent_name');
  
  document.documentElement.style.removeProperty('--accent-blue');
  document.documentElement.style.removeProperty('--accent-blue-hover');
  document.documentElement.style.removeProperty('--border-focus');
  document.documentElement.style.removeProperty('--status-surveillance-bg');
  document.documentElement.style.removeProperty('--status-surveillance-border');
  document.documentElement.style.removeProperty('--status-surveillance-text');
  
  currentThemePalette = 'calm';
  currentThemeMode = 'dark';
  currentTextSize = 'normal';
  currentCustomAccent = null;
  currentCustomAccentName = null;
  
  selectThemePreset('calm', false);
  setThemeMode('dark', false);
  setTextSize('normal', false);
  
  const nameEl = document.getElementById('custom-accent-name');
  if (nameEl) nameEl.textContent = 'Independer Blauw';
  
  document.querySelectorAll('.accent-swatch').forEach((sw, idx) => {
    sw.classList.toggle('active', idx === 0);
  });
  const picker = document.getElementById('custom-accent-picker');
  if (picker) picker.value = '#1d4ed8';

  applyCustomAccentCSS('#1d4ed8', 'Independer Blauw');
  
  showToast('Standaardinstellingen hersteld', 'Uw scherm volgt weer de officiële certificatie-instelling standaarden.', 'success');
}

function toggleUserProfileMenu() {
  const menu = document.getElementById('user-profile-dropdown');
  if (menu) menu.classList.toggle('hidden');
}

// Close user profile dropdown on click outside
document.addEventListener('click', (e) => {
  const wrap = document.getElementById('user-profile-menu-wrap');
  const dropdown = document.getElementById('user-profile-dropdown');
  if (dropdown && !dropdown.classList.contains('hidden')) {
    if (wrap && !wrap.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  }
});

function showThemesHelp() {
  const modal = document.getElementById('modal-content');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return;

  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">
        <span class="material-symbols-outlined" style="color:var(--accent-blue);">palette</span>
        Over thema's & visuele personalisatie
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body" style="font-size:14px; line-height:1.6; color:var(--text-secondary);">
      <p style="margin-bottom:12px;">
        <strong>Persoonlijke weergave:</strong> In Audit Independer kiest elke medewerker een eigen visuele stijl die prettig werkt op kantoor of onderweg.
      </p>
      <ul style="padding-left:20px; margin-bottom:14px;">
        <li style="margin-bottom:6px;"><strong>Calm:</strong> De klassieke navy-op-ivoor huisstijl, ontworpen voor lange sessies zonder visuele vermoeidheid.</li>
        <li style="margin-bottom:6px;"><strong>Petrol:</strong> Rustgevende groenblauwe tinten met frisse contrasten.</li>
        <li style="margin-bottom:6px;"><strong>Aubergine:</strong> Warme, diepe tinten met meer karakter.</li>
        <li style="margin-bottom:6px;"><strong>Graphite:</strong> Minimalistisch grijs/zwart waarbij kleur uitsluitend op actieknoppen verschijnt.</li>
        <li style="margin-bottom:6px;"><strong>High contrast:</strong> Optimaal contrast (WCAG AAA) voor fel zonlicht of vermoeide ogen.</li>
      </ul>
      <p style="font-size:12.5px; color:var(--text-muted); background:var(--bg-card-subtle); padding:10px 12px; border-radius:6px; border:1px solid var(--border-subtle);">
        <em>Let op: Aanpassingen hebben uitsluitend invloed op uw eigen browser en wijzigen niets aan de schermen van collega's of de certificatie-instelling.</em>
      </p>
    </div>
    <div class="modal-footer" style="display:flex; justify-content:flex-end;">
      <button class="tool-btn" style="background:#2563eb; color:#ffffff; border-color:#1d4ed8; font-weight:600;" onclick="closeModal()">Begrepen</button>
    </div>
  `;
  overlay.classList.remove('hidden');
}

function updateThemeControlsUI() {
  selectThemePreset(currentThemePalette, false);
  setThemeMode(currentThemeMode, false);
  setTextSize(currentTextSize, false);
  if (currentCustomAccent) {
    applyCustomAccentCSS(currentCustomAccent, currentCustomAccentName);
  }
}

// Export functions to window
window.selectThemePreset = selectThemePreset;
window.setThemeMode = setThemeMode;
window.setTextSize = setTextSize;
window.setCustomAccent = setCustomAccent;
window.resetThemeToDefault = resetThemeToDefault;
window.toggleUserProfileMenu = toggleUserProfileMenu;
window.showThemesHelp = showThemesHelp;
window.updateThemeControlsUI = updateThemeControlsUI;
window.initUserTheme = initUserTheme;

function openRecordBoardDecisionModal() {
  const modal = document.getElementById('modal-content');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return;

  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">
        <span class="material-symbols-outlined" style="color:#2563eb;">gavel</span>
        Bestuursbesluit Feestdag / Werkdag Vastleggen
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="modal-body">
      <p style="font-size:13.5px; color:var(--text-secondary); margin-bottom:1.25rem;">
        Leg een formeel bestuursbesluit vast over de kwalificatie van een dag als werkdag of feestdag voor termijnberekeningen (Algemene termijnenwet art. 3).
      </p>

      <div style="display:flex; flex-direction:column; gap:12px;">
        <div>
          <label style="font-size:12.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-muted); display:block; margin-bottom:5px;">Datum</label>
          <input type="date" id="board-decision-date" class="worklist-search-field" style="width:100%;" value="2026-05-05">
        </div>

        <div>
          <label style="font-size:12.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-muted); display:block; margin-bottom:5px;">Naam van de dag</label>
          <input type="text" id="board-decision-day" class="worklist-search-field" style="width:100%;" placeholder="bijv. Bevrijdingsdag 2026" value="Bevrijdingsdag 2026">
        </div>

        <div>
          <label style="font-size:12.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-muted); display:block; margin-bottom:5px;">Kwalificatie (Assumed)</label>
          <select id="board-decision-assumed" class="worklist-search-field" style="width:100%;">
            <option value="Assumed — the board decides">Assumed — the board decides (Gelijkgesteld aan feestdag)</option>
            <option value="No">No (Gewone werkdag)</option>
          </select>
        </div>

        <div>
          <label style="font-size:12.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-muted); display:block; margin-bottom:5px;">Grondslag / Bron</label>
          <input type="text" id="board-decision-source" class="worklist-search-field" style="width:100%;" value="Bestuursbesluit Certificatieorgaan 2026/04">
        </div>
      </div>
    </div>
    <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:10px; padding:1rem 1.5rem; border-top:1px solid var(--border-subtle); background:var(--bg-card-header);">
      <button class="tool-btn" onclick="closeModal()">Annuleren</button>
      <button class="tool-btn" style="background:#2563eb; color:#ffffff; border-color:#1d4ed8; font-weight:600;" onclick="saveBoardDecision()">
        <span class="material-symbols-outlined" style="font-size:16px;">check</span>
        <span>Besluit Opslaan</span>
      </button>
    </div>
  `;

  overlay.classList.add('visible');
}
window.openRecordBoardDecisionModal = openRecordBoardDecisionModal;

function saveBoardDecision() {
  const dateInput = document.getElementById('board-decision-date')?.value || '5 May 2026';
  const day = document.getElementById('board-decision-day')?.value || 'Feestdag';
  const assumed = document.getElementById('board-decision-assumed')?.value || 'Assumed — the board decides';
  const source = document.getElementById('board-decision-source')?.value || 'Bestuursbesluit';

  ALL_WORKING_DAYS.unshift({
    date: dateInput,
    day: day,
    assumed: assumed,
    workingValue: 'As the source says',
    source: source
  });

  closeModal();
  renderWorkingDaysTable();
  showToast('Besluit opgeslagen', `Bestuursbesluit voor "${day}" succesvol opgenomen in de werkdagenkalender.`, 'success');
}
window.saveBoardDecision = saveBoardDecision;

function showWorkingDaysHelp() {
  showToast('Werkdagenkalender', 'Deze kalender bepaalt welke dagen als niet-werkdagen tellen bij de berekening van SLA termijnen conform de Algemene termijnenwet.', 'info');
}
window.showWorkingDaysHelp = showWorkingDaysHelp;

function showAssumptionsHelp() {
  showToast('Systeemaannames', 'De 15 vastgestelde aannames bepalen bindende procesuitkomsten zolang het management geen expliciete afwijking heeft geratificeerd.', 'info');
}
window.showAssumptionsHelp = showAssumptionsHelp;

function showThemesHelp() {
  showToast('Themabeheer', 'Hier stelt u het standaard visuele themaprofiel voor de organisatie in. Persoonlijke voorkeuren worden bewaard via de profielknop.', 'info');
}
window.showThemesHelp = showThemesHelp;

// ═══════════════════════════════════════════════════════════════════════
// SETTINGS: HEALTH AND SAFETY POINTS OF ATTENTION ENGINE
// ═══════════════════════════════════════════════════════════════════════

const ALL_HEALTH_SAFETY_CRITERIA = [
  // ─── invented set for seed 20260904 (7 criteria) ───
  {
    id: 'inv_1_1',
    set: 'invented set for seed 20260904',
    number: '1.1',
    criterion: 'Invented requirement 1.1, for practice only.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'inv_1_2',
    set: 'invented set for seed 20260904',
    number: '1.2',
    criterion: 'Invented requirement 1.2, for practice only.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'inv_1_3',
    set: 'invented set for seed 20260904',
    number: '1.3',
    criterion: 'Invented requirement 1.3, for practice only.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'inv_1_4',
    set: 'invented set for seed 20260904',
    number: '1.4',
    criterion: 'Invented requirement 1.4, for practice only.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'inv_1_5',
    set: 'invented set for seed 20260904',
    number: '1.5',
    criterion: 'Invented requirement 1.5, for practice only.',
    isPointOfAttention: true,
    lastChange: {
      summary: 'Marked by Administrator on 12 Oct 2026 07:03',
      meta: '12 Oct 2026 07:03 · Marked · Administrator',
      reason: 'invented: the one health-or-safety criterion of the invented set',
      actor: 'Administrator',
      date: '12 Oct 2026 07:03'
    }
  },
  {
    id: 'inv_2_1',
    set: 'invented set for seed 20260904',
    number: '2.1',
    criterion: 'Invented requirement 2.1, for practice only.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'inv_2_2',
    set: 'invented set for seed 20260904',
    number: '2.2',
    criterion: 'Invented requirement 2.2, for practice only.',
    isPointOfAttention: false,
    lastChange: null
  },

  // ─── 2026-2031 Standard (139 criteria) ───
  // Section 1: Management & Labour (1.1 - 1.24)
  {
    id: 'gk_1_1',
    set: '2026-2031',
    number: '1.1',
    criterion: 'The management is involved and appoints a Green Key Establishment Representative from amongst the staff of the establishment.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_1_2',
    set: '2026-2031',
    number: '1.2',
    criterion: 'The establishment formulates strategic sustainability targets.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_1_3',
    set: '2026-2031',
    number: '1.3',
    criterion: 'The establishment formulates an action plan aligned with its strategic sustainability targets.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_1_4',
    set: '2026-2031',
    number: '1.4',
    criterion: 'The establishment ensures fair labour practices, including written contracts, equal pay for equal work, and remuneration at or above the living wage for all employees and subcontracted workers.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_1_5',
    set: '2026-2031',
    number: '1.5',
    criterion: 'The establishment does not use or accept child labour and ensures the protection of minors in employment.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_1_6',
    set: '2026-2031',
    number: '1.6',
    criterion: 'The establishment provides accessible and non-retaliatory grievance and whistleblower mechanisms for reporting exploitation, discrimination and harassment.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_1_7',
    set: '2026-2031',
    number: '1.7',
    criterion: 'The establishment has procedures in place to ensure a safe and healthy working environment.',
    isPointOfAttention: true,
    lastChange: {
      summary: 'Marked by The scheduler on 12 Oct 2026 07:03',
      meta: '12 Oct 2026 07:03 · Marked · The scheduler',
      reason: 'Decided on 1 October 2026: one of the five criteria of the proposal of 25 September 2026, now a point of attention. It blocks nothing; the auditor and the reviewer decide per not-applicable.',
      actor: 'The scheduler',
      date: '12 Oct 2026 07:03'
    }
  },
  {
    id: 'gk_1_8',
    set: '2026-2031',
    number: '1.8',
    criterion: 'The establishment actively cooperates with a defined number of relevant external stakeholders on environmental or social community development initiatives.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_1_9',
    set: '2026-2031',
    number: '1.9',
    criterion: 'The establishment demonstrates respect for Indigenous Peoples in its operations and representations.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_1_10',
    set: '2026-2031',
    number: '1.10',
    criterion: 'The establishment has procedures in place either focusing on equitable recruitment or equitable development regardless of ethnicity, gender identity, disability, age, sexual orientation, religion, or socio-economic background.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_1_11',
    set: '2026-2031',
    number: '1.11',
    criterion: 'The establishment provides access for people with additional accessibility needs by focusing on minimum 1 defined accessibility category and implementing the required minimum measures for that category.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_1_12',
    set: '2026-2031',
    number: '1.12',
    criterion: 'Plants, and animals, as well as historical and archaeological artefacts, are only sold, traded, or displayed in accordance with international law.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_1_13',
    set: '2026-2031',
    number: '1.13',
    criterion: 'The establishment does not offer, promote, or facilitate entertainment, excursions, or activities that involve the exploitation or suffering of animals.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_1_14',
    set: '2026-2031',
    number: '1.14',
    criterion: 'Animal welfare guidelines are followed when the establishment keeps animals on its premises.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_1_15',
    set: '2026-2031',
    number: '1.15',
    criterion: 'The establishment develops and implements a Code of Business Conduct.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_1_16',
    set: '2026-2031',
    number: '1.16',
    criterion: 'The establishment actively promotes the physical and mental wellbeing of employees by implementing at least 1 tangible initiative per year or maintaining permanent, free or subsidised facilities that support staff wellbeing.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_1_17',
    set: '2026-2031',
    number: '1.17',
    criterion: 'The establishment provides traineeships and part-time or flexible employment opportunities for long-term unemployed individuals or people with limited employability.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_1_18',
    set: '2026-2031',
    number: '1.18',
    criterion: 'The establishment provides access for people with additional accessibility needs by focusing on minimum 2 defined accessibility categories and implementing the required minimum measures for those categories.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_1_19',
    set: '2026-2031',
    number: '1.19',
    criterion: 'The establishment offers local micro or small entrepreneurs the possibility to sell sustainable products that are based on the area\'s nature, history and culture.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_1_20',
    set: '2026-2031',
    number: '1.20',
    criterion: 'The management briefs the staff at least 2 times per year on the establishment\'s sustainability initiatives.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_1_21',
    set: '2026-2031',
    number: '1.21',
    criterion: 'Annual sustainability training is provided to the staff.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_1_22',
    set: '2026-2031',
    number: '1.22',
    criterion: 'The housekeeping service knows and implements the procedures regarding change of towels and sheets.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_1_23',
    set: '2026-2031',
    number: '1.23',
    criterion: 'Informative and educational material is displayed in staff areas to promote responsible behaviour.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_1_24',
    set: '2026-2031',
    number: '1.24',
    criterion: 'The establishment provides its staff with the opportunity to evaluate its environmental and social performance annually and has a procedure for responding to this feedback.',
    isPointOfAttention: false,
    lastChange: null
  },

  // Section 2: Guest Information (2.1 - 2.11)
  {
    id: 'gk_2_1',
    set: '2026-2031',
    number: '2.1',
    criterion: 'The Green Key certificate and information about the programme are displayed in a highly visible and frequently accessed area.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_2_2',
    set: '2026-2031',
    number: '2.2',
    criterion: 'Information about Green Key is available on the establishment\'s website.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_2_3',
    set: '2026-2031',
    number: '2.3',
    criterion: 'The establishment keeps guests informed about its sustainability initiatives and actively encourages participation.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_2_4',
    set: '2026-2031',
    number: '2.4',
    criterion: 'Guest-facing staff are able to inform guests about Green Key and the current sustainability initiatives of the establishment.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_2_5',
    set: '2026-2031',
    number: '2.5',
    criterion: 'The establishment informs and encourages guests to use sustainable transportation alternatives.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_2_6',
    set: '2026-2031',
    number: '2.6',
    criterion: 'The establishment provides its guests with the opportunity to evaluate its sustainability performance.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_2_7',
    set: '2026-2031',
    number: '2.7',
    criterion: 'The establishment actively communicates its sustainability practices and engages with Green Key activities on digital media.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_2_8',
    set: '2026-2031',
    number: '2.8',
    criterion: 'Information about nearby parks, beaches and other ecologically sensitive nature areas is available to guests.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_2_9',
    set: '2026-2031',
    number: '2.9',
    criterion: 'Information promoting responsible tourist behaviour in the destination is provided to guests.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_2_10',
    set: '2026-2031',
    number: '2.10',
    criterion: 'The establishment provides and actively promotes at least 4 awareness-raising activities for guests focused on sustainable development, the environment and the local community.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_2_11',
    set: '2026-2031',
    number: '2.11',
    criterion: 'The establishment offers or facilitates access to non-motorised transportation rental for guests.',
    isPointOfAttention: false,
    lastChange: null
  },

  // Section 3: Water (3.1 - 3.17)
  {
    id: 'gk_3_1',
    set: '2026-2031',
    number: '3.1',
    criterion: 'The total water consumption is recorded at least once a month.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_3_2',
    set: '2026-2031',
    number: '3.2',
    criterion: 'Water outlets are actively monitored and leaks promptly repaired.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_3_3',
    set: '2026-2031',
    number: '3.3',
    criterion: 'Water flow in at least 80% of the showers does not exceed 9 litres per minute.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_3_4',
    set: '2026-2031',
    number: '3.4',
    criterion: 'Water flow in at least 80% of the handwashing taps does not exceed 8 litres per minute.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_3_5',
    set: '2026-2031',
    number: '3.5',
    criterion: 'Urinals have sensors, water saving devices, or are water-free.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_3_6',
    set: '2026-2031',
    number: '3.6',
    criterion: 'Newly purchased toilets have a dual flush system with maximum 3/6 litres per flush or maximum 4.5 litres for sensor-based flushing systems.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_3_7',
    set: '2026-2031',
    number: '3.7',
    criterion: 'Newly purchased dishwashers and laundry machines are water efficient.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_3_8',
    set: '2026-2031',
    number: '3.8',
    criterion: 'Separate water metres are installed in areas with a high-water consumption.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_3_9',
    set: '2026-2031',
    number: '3.9',
    criterion: 'A water risk assessment appropriate to the local context and operational scale has been carried out within the past 6 years.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_3_10',
    set: '2026-2031',
    number: '3.10',
    criterion: 'Rainwater and/or AC condensate is collected and used for suitable purposes.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_3_11',
    set: '2026-2031',
    number: '3.11',
    criterion: 'Water flow in all handwashing taps is maximum 5 litres per minute.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_3_12',
    set: '2026-2031',
    number: '3.12',
    criterion: 'All public handwashing taps are equipped with automatic water cut-off systems.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_3_13',
    set: '2026-2031',
    number: '3.13',
    criterion: 'Bathtubs, jacuzzi/spa or private pools are not present in any of the guest rooms and suites.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_3_14',
    set: '2026-2031',
    number: '3.14',
    criterion: 'Major outdoor water-using systems have measures in place to reduce water consumption.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_3_15',
    set: '2026-2031',
    number: '3.15',
    criterion: 'All wastewater is treated.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_3_16',
    set: '2026-2031',
    number: '3.16',
    criterion: 'At least 1 grease trap is installed in professional or commercial kitchens.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_3_17',
    set: '2026-2031',
    number: '3.17',
    criterion: 'The establishment reuses treated wastewater from on-site or authorised external systems and may supply treated wastewater externally.',
    isPointOfAttention: false,
    lastChange: null
  },

  // Section 4: Energy (4.1 - 4.29)
  {
    id: 'gk_4_1',
    set: '2026-2031',
    number: '4.1',
    criterion: 'Energy use by source is recorded at least once a month.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_2',
    set: '2026-2031',
    number: '4.2',
    criterion: 'The establishment sets a standard temperature for cooling and heating.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_3',
    set: '2026-2031',
    number: '4.3',
    criterion: 'The establishment has an automatic or manual procedure to turn off lights and electrical appliances when guestrooms, rental properties, and meeting rooms are unoccupied.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_4',
    set: '2026-2031',
    number: '4.4',
    criterion: 'The establishment produces or purchases 50% of the energy used for heating and cooling from renewable sources.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_5',
    set: '2026-2031',
    number: '4.5',
    criterion: 'The establishment produces or purchases all energy used for heating and cooling from renewable sources.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_6',
    set: '2026-2031',
    number: '4.6',
    criterion: 'The establishment produces or purchases at least 50% renewable and/or eco-labelled electricity.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_7',
    set: '2026-2031',
    number: '4.7',
    criterion: 'The establishment produces or purchases only renewable and/or eco-labelled electricity.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_8',
    set: '2026-2031',
    number: '4.8',
    criterion: '75% of the windows are energy efficient at a higher standard than the national/local regulation.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_9',
    set: '2026-2031',
    number: '4.9',
    criterion: 'An external energy audit is conducted at least once every 6 years.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_10',
    set: '2026-2031',
    number: '4.10',
    criterion: 'At least 1 sustainable insulation measure is implemented.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_11',
    set: '2026-2031',
    number: '4.11',
    criterion: 'Separate metres are installed at strategically important places for energy monitoring.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_12',
    set: '2026-2031',
    number: '4.12',
    criterion: 'Control systems are in place for ventilation, comfort heating, and comfort cooling.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_13',
    set: '2026-2031',
    number: '4.13',
    criterion: 'Ventilation, comfort heating, and cooling systems are checked at least once a year and adequately maintained.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_14',
    set: '2026-2031',
    number: '4.14',
    criterion: 'At least 80% of all light bulbs in the establishment are LED or demonstrate equal or superior performance in terms of energy efficiency, luminous efficacy, and lifespan.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_15',
    set: '2026-2031',
    number: '4.15',
    criterion: 'Outdoor lighting is minimised and/or has automatic turn-off sensors installed.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_16',
    set: '2026-2031',
    number: '4.16',
    criterion: 'Newly purchased electronic devices in the establishment are rated as energy efficient according to a recognised national or regional energy label system.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_17',
    set: '2026-2031',
    number: '4.17',
    criterion: 'Newly purchased mini bars do not have an energy consumption exceeding 0.6 kWh/day or are rated as energy efficient according to a recognised national or regional energy label system.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_18',
    set: '2026-2031',
    number: '4.18',
    criterion: 'Refrigeration and thermal equipment are regularly maintained following national legislation and manufacturer recommendations.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_19',
    set: '2026-2031',
    number: '4.19',
    criterion: 'Newly purchased refrigeration, ventilation, heating, and cooling, equipment use refrigerants that are free from HCFCs or CFCs.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_20',
    set: '2026-2031',
    number: '4.20',
    criterion: 'An annual leak check is carried out for systems containing refrigerants, and refrigerant refills from the last full calendar year are recorded.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_21',
    set: '2026-2031',
    number: '4.21',
    criterion: 'A heat or cooling recovery system is installed.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_22',
    set: '2026-2031',
    number: '4.22',
    criterion: 'Ventilation, heating, and/or cooling is demand controlled.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_23',
    set: '2026-2031',
    number: '4.23',
    criterion: 'Heating, cooling, and ventilation systems automatically switch off in all the rooms when windows and/or doors are open.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_24',
    set: '2026-2031',
    number: '4.24',
    criterion: 'All the lighting fixtures in public and staff areas have motion detectors, timers, or are reduced when spaces are unoccupied.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_25',
    set: '2026-2031',
    number: '4.25',
    criterion: 'Mini bars or mini refrigerators are absent in at least 90% of guest rooms.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_26',
    set: '2026-2031',
    number: '4.26',
    criterion: 'The establishment offers access to charge electric vehicles.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_27',
    set: '2026-2031',
    number: '4.27',
    criterion: 'The establishment calculates its Scope 1 and 2 greenhouse gas (GHG) emissions using a carbon measurement system that aligns with the internationally recognised GHG Protocol.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_28',
    set: '2026-2031',
    number: '4.28',
    criterion: 'The establishment calculates and reports its Scope 3 greenhouse gas (GHG) emissions using a carbon measurement system that aligns with the internationally recognised GHG Protocol.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_4_29',
    set: '2026-2031',
    number: '4.29',
    criterion: 'The establishment sets and annually reviews a concrete target to reduce its carbon footprint and identifies actions to achieve it.',
    isPointOfAttention: false,
    lastChange: null
  },

  // Section 5: Washing & Cleaning / Waste (5.1 - 5.13)
  {
    id: 'gk_5_1',
    set: '2026-2031',
    number: '5.1',
    criterion: 'The establishment separates waste as required by national legislation and in all cases into at least 3 recyclable categories; staff receive clear instructions on waste handling.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_5_2',
    set: '2026-2031',
    number: '5.2',
    criterion: 'All separated waste categories are handled individually by the local or national waste management facilities, by a private entity or by the establishment\'s own facilities.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_5_3',
    set: '2026-2031',
    number: '5.3',
    criterion: 'The establishment offers its guests practical means to separate their waste in at least 3 categories.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_5_4',
    set: '2026-2031',
    number: '5.4',
    criterion: 'Hazardous chemicals and waste are managed, stored and transported safely to an approved reception facility.',
    isPointOfAttention: true,
    lastChange: {
      summary: 'Marked by The scheduler on 12 Oct 2026 07:03',
      meta: '12 Oct 2026 07:03 · Marked · The scheduler',
      reason: 'Decided on 1 October 2026: one of the five criteria of the proposal of 25 September 2026, now a point of attention. It blocks nothing; the auditor and the reviewer decide per not-applicable.',
      actor: 'The scheduler',
      date: '12 Oct 2026 07:03'
    }
  },
  {
    id: 'gk_5_5',
    set: '2026-2031',
    number: '5.5',
    criterion: 'A waste bin is available close to every toilet.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_5_6',
    set: '2026-2031',
    number: '5.6',
    criterion: 'The establishment records the total amount of waste, residual/mixed waste, and food waste.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_5_7',
    set: '2026-2031',
    number: '5.7',
    criterion: 'Organic waste is composted or used for other purposes.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_5_8',
    set: '2026-2031',
    number: '5.8',
    criterion: 'No single-use food-service items are used for in-house F&B services.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_5_9',
    set: '2026-2031',
    number: '5.9',
    criterion: 'No more than 5 types of F&B products per catering offer are in individually packaged single servings.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_5_10',
    set: '2026-2031',
    number: '5.10',
    criterion: 'Soap, shampoo, conditioner and shower gel are provided in dispensers.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_5_11',
    set: '2026-2031',
    number: '5.11',
    criterion: 'Vanity kits and other single-use amenities for guests are only available in maximum 50% of guest rooms.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_5_12',
    set: '2026-2031',
    number: '5.12',
    criterion: 'For take away F&Bs, the establishment offers the possibility for the guests to bring their own containers or to use returnable containers.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_5_13',
    set: '2026-2031',
    number: '5.13',
    criterion: 'Bed linen and bathroom linen are not disposable and are not delivered in plastic.',
    isPointOfAttention: false,
    lastChange: null
  },

  // Section 6: Purchasing & F&B (6.1 - 6.31)
  {
    id: 'gk_6_1',
    set: '2026-2031',
    number: '6.1',
    criterion: 'The establishment implements and follows a Sustainable Procurement Policy that guides the selection of goods, services and suppliers based on environmental, social and cultural sustainability.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_2',
    set: '2026-2031',
    number: '6.2',
    criterion: 'The establishment informs all third-party operated shops and businesses located on its premises about its sustainability initiatives and Green Key and encourages them to manage their activities in the same spirit.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_3',
    set: '2026-2031',
    number: '6.3',
    criterion: 'At least 75% of newly purchased printing paper, envelopes and printed paper-based materials produced or ordered by the establishment are eco-labelled.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_4',
    set: '2026-2031',
    number: '6.4',
    criterion: 'The establishment takes at least 2 initiatives to reduce the use of paper at the front desk, in offices and/or in guest/meeting rooms.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_5',
    set: '2026-2031',
    number: '6.5',
    criterion: 'At least 1 product categories of newly purchased or rented textiles are socially or environmentally certified.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_6',
    set: '2026-2031',
    number: '6.6',
    criterion: 'At least 50% of the establishment\'s suppliers are eco-certified.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_7',
    set: '2026-2031',
    number: '6.7',
    criterion: 'If the laundry service is outsourced, the provider is either located within 100 km from the establishment or eco-certified.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_8',
    set: '2026-2031',
    number: '6.8',
    criterion: 'At least 75% of the vehicles and transport means owned or rented by the establishment are electric or cargo-bikes.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_9',
    set: '2026-2031',
    number: '6.9',
    criterion: 'The establishment actively promotes and supports sustainable and health-conscious commuting options for staff.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_10',
    set: '2026-2031',
    number: '6.10',
    criterion: 'The establishment takes initiatives to reduce the environmental impact of IT systems.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_11',
    set: '2026-2031',
    number: '6.11',
    criterion: 'Furniture, fixtures and supplies are refurbished, upcycled, or donated to extend their lifecycle.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_12',
    set: '2026-2031',
    number: '6.12',
    criterion: 'The establishment purchases and promotes different categories of F&B products that are either organic, and/or eco-labelled and/or fair-trade labelled and/or locally produced.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_13',
    set: '2026-2031',
    number: '6.13',
    criterion: 'The establishment does not purchase fish, seafood and meat from threatened or protected species.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_14',
    set: '2026-2031',
    number: '6.14',
    criterion: 'At least 1 vegetarian starter; 1 vegetarian main course and either 1 vegan starter or main course are offered, and these options are clearly indicated on the menu/buffet.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_15',
    set: '2026-2031',
    number: '6.15',
    criterion: 'The establishment takes initiatives to reduce the level of food waste.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_16',
    set: '2026-2031',
    number: '6.16',
    criterion: 'Where the water quality is of an adequate standard, tap water is offered to guests.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_17',
    set: '2026-2031',
    number: '6.17',
    criterion: 'At least 10% of all F&B products used in the establishment are either organic, and/or eco-labelled and/or fair-trade labelled and/or locally produced.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_18',
    set: '2026-2031',
    number: '6.18',
    criterion: 'At least 25% of all F&B products used in the establishment are either organic and/or eco-labelled and/or fair-trade labelled and/or locally produced.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_19',
    set: '2026-2031',
    number: '6.19',
    criterion: 'At least 30% of all offered starters and main dishes in the establishment are vegetarian, or, alternatively, at least 1 day per week only vegetarian or vegan meals are offered to both guests and staff.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_20',
    set: '2026-2031',
    number: '6.20',
    criterion: 'The establishment offers at least 1 vegan starter, 1 vegan main dish and 1 vegan desert.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_21',
    set: '2026-2031',
    number: '6.21',
    criterion: 'Bed linen and towels are not changed daily by default, and information on the changing procedures is clearly displayed in guest rooms.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_22',
    set: '2026-2031',
    number: '6.22',
    criterion: 'The establishment offers its guests the option to forego housekeeping/cleaning of the rooms or select partial cleaning services.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_23',
    set: '2026-2031',
    number: '6.23',
    criterion: 'At least 75% of the chemical cleaning products used for routine cleaning have a recognised eco-label.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_24',
    set: '2026-2031',
    number: '6.24',
    criterion: 'Use of disinfection substances is restricted to cases of clear hygiene or health-critical risk.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_25',
    set: '2026-2031',
    number: '6.25',
    criterion: 'All tissue paper products are certified with an eco-label.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_26',
    set: '2026-2031',
    number: '6.26',
    criterion: 'All the dishwashing detergents and rinsing agents have a recognised eco-label.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_27',
    set: '2026-2031',
    number: '6.27',
    criterion: 'All the laundry detergents have a recognised eco-label.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_28',
    set: '2026-2031',
    number: '6.28',
    criterion: 'Concentrated chemical cleaning products and safe dilution system are used for routine cleaning.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_29',
    set: '2026-2031',
    number: '6.29',
    criterion: 'All cosmetic products have a nationally or internationally recognised eco-label.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_30',
    set: '2026-2031',
    number: '6.30',
    criterion: 'Reduced-chemical or chemical-free cleaning methods are used.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_6_31',
    set: '2026-2031',
    number: '6.31',
    criterion: 'Only fragrance- and perfume-free products are used in washing, cleaning, or room care.',
    isPointOfAttention: false,
    lastChange: null
  },

  // Section 7: Indoor Environment & Green Areas (7.1 - 7.14)
  {
    id: 'gk_7_1',
    set: '2026-2031',
    number: '7.1',
    criterion: 'Indoor restaurant areas are non-smoking, and all other public areas are either non-smoking or have clearly separated smoking areas.',
    isPointOfAttention: true,
    lastChange: {
      summary: 'Marked by The scheduler on 12 Oct 2026 07:03',
      meta: '12 Oct 2026 07:03 · Marked · The scheduler',
      reason: 'Decided on 1 October 2026: one of the five criteria of the proposal of 25 September 2026, now a point of attention. It blocks nothing; the auditor and the reviewer decide per not-applicable.',
      actor: 'The scheduler',
      date: '12 Oct 2026 07:03'
    }
  },
  {
    id: 'gk_7_2',
    set: '2026-2031',
    number: '7.2',
    criterion: 'All meeting and guest rooms are non-smoking.',
    isPointOfAttention: true,
    lastChange: {
      summary: 'Marked by The scheduler on 12 Oct 2026 07:03',
      meta: '12 Oct 2026 07:03 · Marked · The scheduler',
      reason: 'Decided on 1 October 2026: one of the five criteria of the proposal of 25 September 2026, now a point of attention. It blocks nothing; the auditor and the reviewer decide per not-applicable.',
      actor: 'The scheduler',
      date: '12 Oct 2026 07:03'
    }
  },
  {
    id: 'gk_7_3',
    set: '2026-2031',
    number: '7.3',
    criterion: 'The establishment has a personnel policy concerning smoking during working hours.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_7_4',
    set: '2026-2031',
    number: '7.4',
    criterion: 'Indoor air quality in at least 2 parts of the establishment is monitored at least once a year.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_7_5',
    set: '2026-2031',
    number: '7.5',
    criterion: 'Authentic elements of the local culture are incorporated in the operation or in connection with refurbishments or construction works.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_7_6',
    set: '2026-2031',
    number: '7.6',
    criterion: 'Environmental and biodiversity impacts are assessed and addressed prior to any new development, expansion, or major construction/renovation work.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_7_7',
    set: '2026-2031',
    number: '7.7',
    criterion: 'Sustainable materials are used for refurbishments or construction works that started and/or were completed in the past 24 months.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_7_8',
    set: '2026-2031',
    number: '7.8',
    criterion: 'The use of agrochemical products is minimised and strictly controlled.',
    isPointOfAttention: true,
    lastChange: {
      summary: 'Marked by The scheduler on 12 Oct 2026 07:03',
      meta: '12 Oct 2026 07:03 · Marked · The scheduler',
      reason: 'Decided on 1 October 2026: one of the five criteria of the proposal of 25 September 2026, now a point of attention. It blocks nothing; the auditor and the reviewer decide per not-applicable.',
      actor: 'The scheduler',
      date: '12 Oct 2026 07:03'
    }
  },
  {
    id: 'gk_7_9',
    set: '2026-2031',
    number: '7.9',
    criterion: 'Newly purchased garden maintenance equipment is electrically or manually driven.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_7_10',
    set: '2026-2031',
    number: '7.10',
    criterion: 'The establishment takes maintenance initiatives in its green areas according to the principles of ecological management.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_7_11',
    set: '2026-2031',
    number: '7.11',
    criterion: 'The establishment takes initiatives to protect and support the local biodiversity on (or around) its premises.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_7_12',
    set: '2026-2031',
    number: '7.12',
    criterion: 'The establishment assesses biodiversity and nature-related risks and opportunities on-site.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_7_13',
    set: '2026-2031',
    number: '7.13',
    criterion: 'The establishment monitors biodiversity supporting habitats and species present on or around its premises.',
    isPointOfAttention: false,
    lastChange: null
  },
  {
    id: 'gk_7_14',
    set: '2026-2031',
    number: '7.14',
    criterion: 'The establishment takes at least 1 initiative in its green areas to promote sustainable food practices.',
    isPointOfAttention: false,
    lastChange: null
  }
];

const expandedHsCriteria = new Set();
let isHsDisclosureOpen = true;

function toggleHsDisclosure() {
  const body = document.getElementById('hs-disclosure-body');
  const caret = document.getElementById('hs-disclosure-caret');
  if (!body || !caret) return;
  isHsDisclosureOpen = !isHsDisclosureOpen;
  if (isHsDisclosureOpen) {
    body.classList.remove('hidden');
    caret.classList.remove('collapsed');
  } else {
    body.classList.add('hidden');
    caret.classList.add('collapsed');
  }
}
window.toggleHsDisclosure = toggleHsDisclosure;

function toggleHsCriterionRow(id) {
  if (expandedHsCriteria.has(id)) {
    expandedHsCriteria.delete(id);
  } else {
    expandedHsCriteria.add(id);
  }
  renderHealthSafetyTable();
}
window.toggleHsCriterionRow = toggleHsCriterionRow;

function applyHealthSafetyFilters() {
  const clearBtn = document.getElementById('hs-search-clear');
  const searchInput = document.getElementById('hs-search-input');
  if (clearBtn && searchInput) {
    if (searchInput.value.trim().length > 0) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');
  }
  renderHealthSafetyTable();
}
window.applyHealthSafetyFilters = applyHealthSafetyFilters;

function clearHealthSafetySearch() {
  const searchInput = document.getElementById('hs-search-input');
  const clearBtn = document.getElementById('hs-search-clear');
  if (searchInput) searchInput.value = '';
  if (clearBtn) clearBtn.classList.add('hidden');
  renderHealthSafetyTable();
}
window.clearHealthSafetySearch = clearHealthSafetySearch;

function renderHealthSafetyTable() {
  const tbody = document.getElementById('hs-table-tbody');
  if (!tbody) return;

  const markedFilter = document.getElementById('hs-filter-marked');
  const searchInput = document.getElementById('hs-search-input');
  const onlyMarked = markedFilter ? markedFilter.checked : false;
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  // Update total marked count in header summary pill
  const totalMarked = ALL_HEALTH_SAFETY_CRITERIA.filter(c => c.isPointOfAttention).length;
  const countBadge = document.getElementById('hs-summary-count-badge');
  if (countBadge) countBadge.textContent = totalMarked;

  // Filter criteria
  const filtered = ALL_HEALTH_SAFETY_CRITERIA.filter(c => {
    if (onlyMarked && !c.isPointOfAttention) return false;
    if (query) {
      const matchNum = c.number.toLowerCase().includes(query);
      const matchText = c.criterion.toLowerCase().includes(query);
      const matchSet = c.set.toLowerCase().includes(query);
      return matchNum || matchText || matchSet;
    }
    return true;
  });

  // Update caption count
  const countCaption = document.getElementById('hs-count-caption');
  if (countCaption) {
    countCaption.textContent = `${filtered.length} of ${ALL_HEALTH_SAFETY_CRITERIA.length} criteria shown.`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
          <span class="material-symbols-outlined" style="font-size: 32px; display: block; margin-bottom: 8px; opacity: 0.6;">search_off</span>
          Geen criteria gevonden die voldoen aan de zoekfilter.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(c => {
    const isExpanded = expandedHsCriteria.has(c.id);

    const mainRow = `
      <tr class="hs-row ${c.isPointOfAttention ? 'is-marked' : ''}">
        <td class="hs-set-name">${c.set}</td>
        <td class="hs-num-col">${c.number}</td>
        <td class="hs-criterion-cell">
          <div class="hs-row-toggle" onclick="toggleHsCriterionRow('${c.id}')" title="Klik voor verificatiedetails en Gate check 8 protocol">
            <span class="hs-row-caret ${isExpanded ? 'expanded' : ''}">▶</span>
            <span class="hs-criterion-text">${c.criterion}</span>
          </div>
        </td>
        <td>
          ${c.isPointOfAttention
            ? '<span class="hs-poa-badge">Point of attention</span>'
            : '<span class="hs-poa-none">No</span>'}
        </td>
        <td>
          ${c.lastChange ? `
            <div class="hs-change-summary">${c.lastChange.summary}</div>
            <div class="hs-change-meta">${c.lastChange.meta}</div>
            <div class="hs-change-reason">${c.lastChange.reason}</div>
          ` : '<span style="color:var(--text-muted); font-size:13px;">Never changed here</span>'}
        </td>
        <td style="text-align: right;">
          ${c.isPointOfAttention
            ? `<button class="hs-action-btn btn-remove" onclick="openHealthSafetyModal('${c.id}', 'remove')">Remove the point of attention</button>`
            : `<button class="hs-action-btn btn-make" onclick="openHealthSafetyModal('${c.id}', 'mark')">Make it a point of attention</button>`}
        </td>
      </tr>
    `;

    const drawerRow = isExpanded ? `
      <tr class="hs-drawer-row">
        <td colspan="6">
          <div class="hs-drawer-content">
            <div class="hs-drawer-title">
              <span class="material-symbols-outlined" style="font-size: 16px;">verified_user</span>
              <span>Gate check 8 Protocol & Verificatie-instructie voor Criterium ${c.number}</span>
            </div>
            <div class="hs-drawer-desc">
              Wanneer de vestiging verzoekt om criterium <strong>${c.number}</strong> (${c.set}) als <em>niet van toepassing</em> te beschouwen, valideert Gate check 8 of zowel de auditeur als de beoordelaar hebben getoetst op direct negatieve impact op de gezondheid of veiligheid van medewerkers en gasten.
            </div>
            <div style="font-size: 12px; color: #94a3b8; display: flex; gap: 16px; margin-top: 4px;">
              <span><strong>Bronnorm:</strong> Green Key Scheme 2026-2031 (FEE)</span>
              <span><strong>Status:</strong> ${c.isPointOfAttention ? 'Aandachtspunt actief (Gate check 8 waakt)' : 'Standaard criterium'}</span>
            </div>
          </div>
        </td>
      </tr>
    ` : '';

    return mainRow + drawerRow;
  }).join('');
}
window.renderHealthSafetyTable = renderHealthSafetyTable;

function openHealthSafetyModal(id, actionType) {
  const c = ALL_HEALTH_SAFETY_CRITERIA.find(x => x.id === id);
  if (!c) return;

  const modal = document.getElementById('modal-content');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return;

  const isMark = (actionType === 'mark');
  const actionTitle = isMark ? 'Make it a point of attention' : 'Remove the point of attention';
  const defaultReason = isMark
    ? 'Decided on 12 October 2026: identified direct impact on health or safety. It blocks nothing; the auditor and the reviewer decide per not-applicable.'
    : 'Decided on 12 October 2026: requirement revised; no direct negative impact on health or safety identified.';
  const currentActor = (typeof RBAC !== 'undefined' && RBAC.getRole && RBAC.getRole().label) || 'Administrator';

  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title" style="display:flex; align-items:center; gap:8px;">
        <span class="material-symbols-outlined" style="color:${isMark ? '#38bdf8' : '#ef4444'};">
          ${isMark ? 'health_and_safety' : 'cancel'}
        </span>
        ${actionTitle} · Criterium ${c.number}
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="modal-body" style="padding: 1.5rem; display: flex; flex-direction: column; gap: 14px;">
      <div style="background: rgba(15, 23, 42, 0.4); border: 1px solid #1e3a5f; border-radius: 6px; padding: 12px 14px;">
        <div style="display: flex; gap: 12px; font-size: 12.5px; color: #94a3b8; margin-bottom: 4px;">
          <span><strong>Criteria set:</strong> ${c.set}</span>
          <span><strong>Nummer:</strong> ${c.number}</span>
        </div>
        <div style="font-size: 13.5px; color: #f1f5f9; line-height: 1.5;">${c.criterion}</div>
      </div>

      <div>
        <label style="font-size:12.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-muted); display:block; margin-bottom:6px;">
          Reden voor wijziging (verplicht voor auditlog & Gate check 8)
        </label>
        <textarea id="hs-modal-reason" class="worklist-search-field" style="width:100%; height:90px; padding:8px 10px; resize:vertical; font-size:13px; line-height:1.5;">${defaultReason}</textarea>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div>
          <label style="font-size:12.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-muted); display:block; margin-bottom:6px;">
            Bron / Grondslag
          </label>
          <input type="text" id="hs-modal-source" class="worklist-search-field" style="width:100%; height:36px; padding:0 10px; font-size:13px;" value="Green Key / Board decision">
        </div>
        <div>
          <label style="font-size:12.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-muted); display:block; margin-bottom:6px;">
            Geregistreerd door (Actor)
          </label>
          <input type="text" id="hs-modal-actor" class="worklist-search-field" style="width:100%; height:36px; padding:0 10px; font-size:13px; opacity:0.85;" value="${currentActor}" readonly>
        </div>
      </div>
    </div>
    <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:10px; padding:1rem 1.5rem; border-top:1px solid var(--border-subtle); background:var(--bg-card-header);">
      <button class="tool-btn" onclick="closeModal()">Annuleren</button>
      <button class="tool-btn" style="${isMark ? 'background:#2563eb; color:#ffffff; border-color:#1d4ed8;' : 'background:#dc2626; color:#ffffff; border-color:#b91c1c;'} font-weight:600;" onclick="saveHealthSafetyChange('${c.id}', '${actionType}')">
        <span class="material-symbols-outlined" style="font-size:16px;">check</span>
        <span>${isMark ? 'Markeer als aandachtspunt' : 'Verwijder aandachtspunt'}</span>
      </button>
    </div>
  `;

  overlay.classList.add('visible');
}
window.openHealthSafetyModal = openHealthSafetyModal;

function saveHealthSafetyChange(id, actionType) {
  const c = ALL_HEALTH_SAFETY_CRITERIA.find(x => x.id === id);
  if (!c) return;

  const reasonInput = document.getElementById('hs-modal-reason');
  const actorInput = document.getElementById('hs-modal-actor');
  const reasonText = (reasonInput && reasonInput.value.trim()) || 'Decided by the board: recorded with reason.';
  const actorText = (actorInput && actorInput.value.trim()) || 'Administrator';
  const now = '12 Oct 2026 07:03';

  const isMark = (actionType === 'mark');
  c.isPointOfAttention = isMark;
  c.lastChange = {
    summary: `${isMark ? 'Marked' : 'Removed'} by ${actorText} on ${now}`,
    meta: `${now} · ${isMark ? 'Marked' : 'Removed'} · ${actorText}`,
    reason: reasonText,
    actor: actorText,
    date: now
  };

  closeModal();
  renderHealthSafetyTable();
  showToast(
    'Point of attention bijgewerkt',
    `Criterium ${c.number} is ${isMark ? 'succesvol aangemerkt als' : 'verwijderd als'} aandachtspunt.`,
    isMark ? 'success' : 'info'
  );
}
window.saveHealthSafetyChange = saveHealthSafetyChange;

function showHealthSafetyHelp() {
  const modal = document.getElementById('modal-content');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return;

  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title" style="display:flex; align-items:center; gap:8px;">
        <span class="material-symbols-outlined" style="color:#38bdf8;">help_outline</span>
        Over Health and safety: points of attention
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="modal-body" style="padding:1.5rem; font-size:13.5px; line-height:1.6; color:#cbd5e1; display:flex; flex-direction:column; gap:12px;">
      <p>
        <strong>Wat is een point of attention?</strong><br>
        Deze criteria vereisen bijzondere aandacht wanneer een vestiging verzoekt om ze als <em>niet van toepassing</em> (N.v.t.) te behandelen. De auditeur en de beoordelaar beslissen per casus.
      </p>
      <div style="background:rgba(56,189,248,0.08); border-left:3px solid #38bdf8; padding:10px 14px; border-radius:0 4px 4px 0;">
        <strong>Poortcontrole 8 (Gate check 8):</strong><br>
        Een point of attention blokkeert op zichzelf niets. Poortcontrole 8 leest, per 'niet van toepassing' verklaring, of de auditeur en de beoordelaar een direct negatief effect op gezondheid of veiligheid hebben vastgesteld.
      </div>
      <p>
        <strong>Herkomst & Audittrail:</strong><br>
        Het certificatieschema bevat van oorsprong geen vaste lijst; voorbeelden uit Green Key worden toegevoegd met Green Key als bron. Elke toevoeging of verwijdering wordt vastgelegd met een motivering, datum en geregistreerde gebruiker.
      </p>
    </div>
    <div class="modal-footer" style="display:flex; justify-content:flex-end; padding:1rem 1.5rem; border-top:1px solid var(--border-subtle); background:var(--bg-card-header);">
      <button class="tool-btn" style="background:#2563eb; color:#ffffff; border-color:#1d4ed8; font-weight:600;" onclick="closeModal()">Begrepen</button>
    </div>
  `;
  overlay.classList.add('visible');
}
window.showHealthSafetyHelp = showHealthSafetyHelp;

// ═══════════════════════════════════════════════════════════════════════
// SETTINGS: USERS AND ROLES ENGINE (AUTHENTIC ADMINISTRATOR SCREEN)
// ═══════════════════════════════════════════════════════════════════════

const ROLE_DEFINITIONS = [
  { id: 'Reviewer', title: 'Reviewer', desc: 'Reviews a dossier and writes the draft decision. Cannot decide on a dossier they reviewed.' },
  { id: 'Decision maker', title: 'Decision maker', desc: 'Takes the certification decision on a dossier somebody else reviewed.' },
  { id: 'Assigner', title: 'Assigner', desc: 'Proposes an auditor for a dossier.' },
  { id: 'Coordinator', title: 'Coordinator', desc: 'Does the administrative work on a dossier: pre-screening, price, invoice, links, the report received and the certificate. Decides nothing.' },
  { id: 'Complaint handler', title: 'Complaint handler', desc: 'Handles complaints and appeals.' },
  { id: 'Administrator', title: 'Administrator', desc: 'Manages people, roles and settings. Does not review or decide.' },
  { id: 'Wall screen', title: 'Wall screen', desc: 'For the television in the office only: sees the office overview and nothing else.' },
  { id: 'Test mail sender', title: 'Test mail sender', desc: 'Sends a test of an outreach mail to somebody who uses this system. Sends nothing to a party.' },
  { id: 'Observer', title: 'Observer', desc: 'Looks along at the screens of the other roles. Records, changes and sends nothing.' }
];

const ALSO_DEFINITIONS = [
  { id: 'technicalStaff', title: 'technical staff', desc: 'Counts for the impartiality check on staff, and cannot be the auditor on a dossier.' },
  { id: 'impartialityCommittee', title: 'impartiality committee', desc: 'Handles complaints about impartiality.' }
];

let ALL_USERS_DATA = [
  {
    id: 'user-allebei',
    name: 'A. Allebei',
    email: 'both@example.test',
    roles: ['Reviewer', 'Decision maker'],
    status: 'Deactivated',
    lastSignedIn: 'not recorded yet',
    isPractice: true,
    technicalStaff: false,
    impartialityCommittee: false
  },
  {
    id: 'user-beoordelaar',
    name: 'B. Beoordelaar',
    email: 'reviewer@example.test',
    roles: ['Reviewer'],
    status: 'Deactivated',
    lastSignedIn: 'not recorded yet',
    isPractice: true,
    technicalStaff: false,
    impartialityCommittee: false
  },
  {
    id: 'user-beslisser',
    name: 'D. Beslisser',
    email: 'decider@example.test',
    roles: ['Decision maker'],
    status: 'Deactivated',
    lastSignedIn: 'not recorded yet',
    isPractice: true,
    technicalStaff: false,
    impartialityCommittee: false
  },
  {
    id: 'user-elysia',
    name: 'Elysia',
    email: 'elysia@auditindepender.com',
    roles: ['Coordinator'],
    status: 'Active',
    lastSignedIn: 'not recorded yet',
    isPractice: false,
    technicalStaff: false,
    impartialityCommittee: false
  },
  {
    id: 'user-george',
    name: 'George',
    email: 'george@auditindepender.com',
    roles: ['Administrator'],
    status: 'Active',
    lastSignedIn: '12 Oct 2026 08:42',
    isPractice: false,
    technicalStaff: false,
    impartialityCommittee: false
  },
  {
    id: 'user-klachten',
    name: 'K. Klachten',
    email: 'complaints@example.test',
    roles: ['Complaint handler'],
    status: 'Deactivated',
    lastSignedIn: 'not recorded yet',
    isPractice: true,
    technicalStaff: false,
    impartialityCommittee: false
  },
  {
    id: 'user-kelly',
    name: 'Kelly Ruigrok',
    email: 'kelly@auditindepender.com',
    roles: ['Administrator', 'Reviewer', 'Decision maker', 'Assigner'],
    status: 'Active',
    lastSignedIn: 'not recorded yet',
    isPractice: false,
    technicalStaff: false,
    impartialityCommittee: false
  },
  {
    id: 'user-beheerder',
    name: 'M. Beheerder',
    email: 'admin@example.test',
    roles: ['Administrator', 'Reviewer', 'Decision maker', 'Coordinator'],
    status: 'Deactivated',
    lastSignedIn: 'not recorded yet',
    isPractice: true,
    technicalStaff: false,
    impartialityCommittee: false
  },
  {
    id: 'user-michael',
    name: 'Michael v.d. Klugt',
    email: 'michael@auditindepender.com',
    roles: ['Administrator', 'Reviewer', 'Decision maker', 'Assigner', 'Coordinator', 'Complaint handler'],
    status: 'Active',
    lastSignedIn: 'not recorded yet',
    isPractice: false,
    technicalStaff: false,
    impartialityCommittee: false
  },
  {
    id: 'user-toewijzer',
    name: 'T. Toewijzer',
    email: 'assigner@example.test',
    roles: ['Assigner'],
    status: 'Deactivated',
    lastSignedIn: 'not recorded yet',
    isPractice: true,
    technicalStaff: false,
    impartialityCommittee: false
  },
  {
    id: 'user-test',
    name: 'test gebruiker',
    email: 'test@example.test',
    roles: ['Reviewer', 'Decision maker', 'Assigner'],
    status: 'Deactivated',
    lastSignedIn: 'not recorded yet',
    isPractice: true,
    technicalStaff: false,
    impartialityCommittee: false
  },
  {
    id: 'user-wilco',
    name: 'Wilco Heijkants',
    email: 'wilco@auditindepender.com',
    roles: ['Administrator', 'Wall screen', 'Test mail sender', 'Observer', 'Coordinator'],
    status: 'Active',
    lastSignedIn: 'not recorded yet',
    isPractice: false,
    technicalStaff: false,
    impartialityCommittee: false
  }
];

// Pre-seeded 91 role change audit log entries
function generateInitialRoleChanges() {
  const changers = ['George', 'Kelly Ruigrok', 'Michael v.d. Klugt', 'Installation system'];
  const people = [
    { name: 'George', email: 'george@auditindepender.com' },
    { name: 'Wilco Heijkants', email: 'wilco@auditindepender.com' },
    { name: 'Michael v.d. Klugt', email: 'michael@auditindepender.com' },
    { name: 'Kelly Ruigrok', email: 'kelly@auditindepender.com' },
    { name: 'Elysia', email: 'elysia@auditindepender.com' },
    { name: 'M. Beheerder', email: 'admin@example.test' },
    { name: 'A. Allebei', email: 'both@example.test' },
    { name: 'B. Beoordelaar', email: 'reviewer@example.test' },
    { name: 'D. Beslisser', email: 'decider@example.test' },
    { name: 'K. Klachten', email: 'complaints@example.test' },
    { name: 'T. Toewijzer', email: 'assigner@example.test' },
    { name: 'test gebruiker', email: 'test@example.test' }
  ];

  const reasons = [
    'Annual segregation of duties review and RBAC alignment',
    'Assigned Coordinator role for onboarding administrative workflow',
    'Added Assigner permission following training on competence assignment',
    'Separation of Reviewer and Decision maker for 4-eyes principle',
    'Practice account configuration for training session',
    'Temporary observer rights granted for certification audit shadow',
    'System initialization and standard profile bootstrap',
    'Impartiality policy compliance adjustment',
    'Removed review authority during pending impartiality committee check',
    'Activated wall screen office broadcast view for reception monitor',
    'Test mail outreach authorization configuration',
    'Deactivated upon departure from practice rehearsal cycle'
  ];

  const roleActions = [
    '+ Administrator',
    '+ Coordinator',
    '+ Reviewer',
    '+ Decision maker',
    '+ Assigner',
    '+ Wall screen',
    '+ Observer',
    '+ Test mail sender',
    '- Reviewer, + Assigner',
    '+ Complaint handler',
    '+ technical staff',
    '+ impartiality committee'
  ];

  const list = [
    {
      when: '12 Oct 2026 08:35',
      personName: 'George',
      personEmail: 'george@auditindepender.com',
      roleChange: '+ Administrator',
      changedBy: 'George',
      reason: 'Administrator security check during rehearsal setup'
    },
    {
      when: '11 Oct 2026 17:15',
      personName: 'Kelly Ruigrok',
      personEmail: 'kelly@auditindepender.com',
      roleChange: '+ Assigner',
      changedBy: 'George',
      reason: 'Capacity allocation for October audit wave'
    },
    {
      when: '11 Oct 2026 14:02',
      personName: 'Michael v.d. Klugt',
      personEmail: 'michael@auditindepender.com',
      roleChange: '+ Complaint handler',
      changedBy: 'George',
      reason: 'Handling appeals and complaints under ISO 17021'
    },
    {
      when: '10 Oct 2026 16:40',
      personName: 'Wilco Heijkants',
      personEmail: 'wilco@auditindepender.com',
      roleChange: '+ Wall screen, + Observer',
      changedBy: 'George',
      reason: 'TV overview setup in office monitoring area'
    },
    {
      when: '10 Oct 2026 11:20',
      personName: 'Elysia',
      personEmail: 'elysia@auditindepender.com',
      roleChange: '+ Coordinator',
      changedBy: 'Kelly Ruigrok',
      reason: 'Pre-screening and invoicing administrative delegation'
    }
  ];

  // Fill up to 91 realistic audit events
  for (let i = 6; i <= 91; i++) {
    const day = Math.max(1, 12 - Math.floor(i / 8));
    const hour = (8 + (i * 3) % 10).toString().padStart(2, '0');
    const min = ((i * 7) % 60).toString().padStart(2, '0');
    const p = people[i % people.length];
    list.push({
      when: `${day.toString().padStart(2, '0')} Oct 2026 ${hour}:${min}`,
      personName: p.name,
      personEmail: p.email,
      roleChange: roleActions[i % roleActions.length],
      changedBy: changers[i % changers.length],
      reason: reasons[i % reasons.length]
    });
  }

  return list;
}

let ROLE_CHANGES_AUDIT_LOG = generateInitialRoleChanges();
let currentUrSelectedUserId = 'user-george';
let currentUrTab = 'people';

function renderUsersRolesTable() {
  const tbody = document.getElementById('ur-people-tbody');
  if (!tbody) return;

  const searchVal = (document.getElementById('ur-search-input')?.value || '').trim().toLowerCase();
  const roleVal = document.getElementById('ur-role-select')?.value || 'all';
  const statusVal = document.getElementById('ur-status-select')?.value || 'all';
  const showPractice = document.getElementById('ur-show-practice')?.checked ?? true;

  // Filter users
  const filtered = ALL_USERS_DATA.filter(u => {
    // Practice account filter
    if (!showPractice && u.isPractice) return false;

    // Search filter (name or email)
    if (searchVal) {
      const matchName = u.name.toLowerCase().includes(searchVal);
      const matchEmail = u.email.toLowerCase().includes(searchVal);
      if (!matchName && !matchEmail) return false;
    }

    // Role filter
    if (roleVal !== 'all') {
      if (!u.roles.includes(roleVal)) return false;
    }

    // Status filter
    if (statusVal !== 'all') {
      if (u.status !== statusVal) return false;
    }

    return true;
  });

  // Calculate hidden practice accounts
  const totalPractice = ALL_USERS_DATA.filter(u => u.isPractice).length;
  const hiddenPractice = showPractice ? 0 : totalPractice;

  // Update footer text
  const footerEl = document.getElementById('ur-table-footer');
  if (footerEl) {
    footerEl.textContent = `Showing ${filtered.length} people · ${hiddenPractice} practice accounts hidden · System accounts: 1 (the scheduler) · sign-ins are recorded since 1 October 2026`;
  }

  // Update tabs counters
  const peopleCountEl = document.getElementById('ur-count-people');
  if (peopleCountEl) peopleCountEl.textContent = ALL_USERS_DATA.length;

  const changesCountEl = document.getElementById('ur-count-changes');
  if (changesCountEl) changesCountEl.textContent = ROLE_CHANGES_AUDIT_LOG.length;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding:3rem; color:var(--text-muted);">
          <span class="material-symbols-outlined" style="font-size:32px; display:block; margin-bottom:8px; opacity:0.6;">group_off</span>
          Geen medewerkers gevonden die voldoen aan de filters.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(u => {
    const isSelected = u.id === currentUrSelectedUserId;
    const rolePills = u.roles.map(r => `<span class="ur-role-pill">${r}</span>`).join(' ');
    const statusClass = u.status === 'Active' ? 'ur-status-text-active' : 'ur-status-text-deactivated';

    return `
      <tr class="ur-user-row ${isSelected ? 'selected' : ''}" onclick="selectUserForDrawer('${u.id}')" id="ur-row-${u.id}">
        <td>
          <div class="ur-user-name">${u.name}</div>
          <div class="ur-user-email">${u.email}</div>
        </td>
        <td>
          <div class="ur-role-badges-wrap">
            ${rolePills}
          </div>
        </td>
        <td>
          <span class="${statusClass}">${u.status}</span>
        </td>
        <td style="color:var(--text-muted); font-size:13px;">
          ${u.lastSignedIn}
        </td>
        <td style="text-align:center;" onclick="event.stopPropagation(); selectUserForDrawer('${u.id}');">
          <button class="ur-more-btn" title="Edit roles for ${u.name}">···</button>
        </td>
      </tr>
    `;
  }).join('');

  // Always update drawer if selected user exists
  renderUserDrawer();
}
window.renderUsersRolesTable = renderUsersRolesTable;

function applyUsersRolesFilters() {
  const searchInput = document.getElementById('ur-search-input');
  const clearBtn = document.getElementById('ur-search-clear');
  if (clearBtn && searchInput) {
    if (searchInput.value.trim().length > 0) {
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
    }
  }
  renderUsersRolesTable();
}
window.applyUsersRolesFilters = applyUsersRolesFilters;

function clearUsersRolesSearch() {
  const searchInput = document.getElementById('ur-search-input');
  if (searchInput) {
    searchInput.value = '';
    applyUsersRolesFilters();
    searchInput.focus();
  }
}
window.clearUsersRolesSearch = clearUsersRolesSearch;

function selectUserForDrawer(userId) {
  currentUrSelectedUserId = userId;
  const drawer = document.getElementById('ur-drawer');
  const layout = document.getElementById('ur-main-layout');

  if (drawer) drawer.classList.remove('hidden');
  if (layout) layout.classList.remove('drawer-closed');

  // Update selected highlight in table
  document.querySelectorAll('.ur-user-row').forEach(row => row.classList.remove('selected'));
  const activeRow = document.getElementById(`ur-row-${userId}`);
  if (activeRow) activeRow.classList.add('selected');

  renderUserDrawer();
}
window.selectUserForDrawer = selectUserForDrawer;

function closeUserDrawer() {
  const drawer = document.getElementById('ur-drawer');
  const layout = document.getElementById('ur-main-layout');
  if (drawer) drawer.classList.add('hidden');
  if (layout) layout.classList.add('drawer-closed');
  document.querySelectorAll('.ur-user-row').forEach(row => row.classList.remove('selected'));
}
window.closeUserDrawer = closeUserDrawer;

function renderUserDrawer() {
  const user = ALL_USERS_DATA.find(u => u.id === currentUrSelectedUserId);
  if (!user) return;

  const nameEl = document.getElementById('ur-drawer-name');
  if (nameEl) nameEl.textContent = user.name;

  const metaEl = document.getElementById('ur-drawer-meta');
  if (metaEl) {
    const statusSpan = `<span class="${user.status === 'Active' ? 'ur-status-text-active' : 'ur-status-text-deactivated'}">${user.status}</span>`;
    metaEl.innerHTML = `${user.email} · ${statusSpan} · last signed in ${user.lastSignedIn}`;
  }

  const viewAsLink = document.getElementById('ur-view-as-link');
  if (viewAsLink) {
    viewAsLink.textContent = `View as ${user.name}`;
    viewAsLink.title = `Switch simulated perspective to ${user.name}`;
  }

  // Render roles list
  const rolesListEl = document.getElementById('ur-roles-list');
  if (rolesListEl) {
    rolesListEl.innerHTML = ROLE_DEFINITIONS.map(r => {
      const isChecked = user.roles.includes(r.id);
      return `
        <label class="ur-check-item">
          <input type="checkbox" name="ur-role-check" value="${r.id}" ${isChecked ? 'checked' : ''} />
          <div class="ur-check-content">
            <span class="ur-check-title">${r.title}</span>
            <span>${r.desc}</span>
          </div>
        </label>
      `;
    }).join('');
  }

  // Render ALSO list
  const alsoListEl = document.getElementById('ur-also-list');
  if (alsoListEl) {
    alsoListEl.innerHTML = ALSO_DEFINITIONS.map(a => {
      const isChecked = user[a.id] === true;
      return `
        <label class="ur-check-item">
          <input type="checkbox" name="ur-also-check" value="${a.id}" ${isChecked ? 'checked' : ''} />
          <div class="ur-check-content">
            <span class="ur-check-title">${a.title}</span>
            <span>${a.desc}</span>
          </div>
        </label>
      `;
    }).join('');
  }

  // Deactivate button label & state
  const deactBtn = document.getElementById('ur-deactivate-btn');
  if (deactBtn) {
    if (user.status === 'Active') {
      deactBtn.textContent = 'Deactivate person';
      deactBtn.className = 'ur-btn-danger-outline';
    } else {
      deactBtn.textContent = 'Activate person';
      deactBtn.className = 'ur-btn-secondary';
    }
  }

  // Clear reason input
  const reasonInput = document.getElementById('ur-reason-input');
  if (reasonInput) reasonInput.value = '';
}

function saveSelectedUserRoles() {
  const user = ALL_USERS_DATA.find(u => u.id === currentUrSelectedUserId);
  if (!user) return;

  const reasonInput = document.getElementById('ur-reason-input');
  const reason = (reasonInput?.value || '').trim();

  if (!reason) {
    showToast('Reden verplicht', 'Vul een reden in voor deze rolwijziging conform de audit trail vereisten.', 'warning');
    if (reasonInput) {
      reasonInput.focus();
      reasonInput.style.borderColor = '#ef4444';
      setTimeout(() => { reasonInput.style.borderColor = ''; }, 2500);
    }
    return;
  }

  // Gather checked roles
  const checkedRoles = Array.from(document.querySelectorAll('input[name="ur-role-check"]:checked')).map(cb => cb.value);
  const checkedAlso = Array.from(document.querySelectorAll('input[name="ur-also-check"]:checked')).map(cb => cb.value);

  // Determine difference
  const addedRoles = checkedRoles.filter(r => !user.roles.includes(r));
  const removedRoles = user.roles.filter(r => !checkedRoles.includes(r));

  let changeDesc = '';
  if (addedRoles.length > 0) changeDesc += addedRoles.map(r => `+ ${r}`).join(', ');
  if (removedRoles.length > 0) {
    if (changeDesc) changeDesc += '; ';
    changeDesc += removedRoles.map(r => `- ${r}`).join(', ');
  }
  if (!changeDesc) changeDesc = 'Updated attributes / verified';

  // Apply changes to user
  user.roles = checkedRoles;
  user.technicalStaff = checkedAlso.includes('technicalStaff');
  user.impartialityCommittee = checkedAlso.includes('impartialityCommittee');

  // Add audit log
  const now = new Date();
  const dayStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  ROLE_CHANGES_AUDIT_LOG.unshift({
    when: `${dayStr} ${timeStr}`,
    personName: user.name,
    personEmail: user.email,
    roleChange: changeDesc,
    changedBy: 'George',
    reason: reason
  });

  if (reasonInput) reasonInput.value = '';

  showToast('Rollen opgeslagen', `Rollen van ${user.name} zijn bijgewerkt en vastgelegd in het audittrail.`, 'success');
  renderUsersRolesTable();
  if (currentUrTab === 'changes') {
    renderRoleChangesTable();
  }
}
window.saveSelectedUserRoles = saveSelectedUserRoles;

function viewAsSelectedUser() {
  const user = ALL_USERS_DATA.find(u => u.id === currentUrSelectedUserId);
  if (!user) return;

  if (typeof RBAC !== 'undefined') {
    if (user.roles.includes('Administrator')) {
      RBAC.setRole('administrator');
    } else if (user.roles.includes('Reviewer')) {
      RBAC.setRole('reviewer');
    } else if (user.roles.includes('Decision maker')) {
      RBAC.setRole('reviewer');
    } else if (user.roles.includes('Assigner')) {
      RBAC.setRole('assigner');
    } else if (user.roles.includes('Coordinator')) {
      RBAC.setRole('coordinator');
    } else {
      RBAC.setRole('coordinator');
    }
  }

  showToast('Perspectief gewisseld', `U bekijkt het systeem nu als ${user.name} (${user.roles.join(', ') || 'Geen rollen'}).`, 'info');
}
window.viewAsSelectedUser = viewAsSelectedUser;

function makePasswordLinkForSelectedUser() {
  const user = ALL_USERS_DATA.find(u => u.id === currentUrSelectedUserId);
  if (!user) return;

  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;

  const token = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
  const passUrl = `https://rehearsal.auditindepender.com/set-password?token=${token}&email=${encodeURIComponent(user.email)}`;

  overlay.innerHTML = `
    <div class="modal-card" style="max-width:540px;" onclick="event.stopPropagation()">
      <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; padding:1.25rem 1.5rem; border-bottom:1px solid var(--border-subtle);">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="material-symbols-outlined" style="color:#2563eb;">vpn_key</span>
          <h3 style="margin:0; font-size:17px; font-weight:700;">Password link for ${user.name}</h3>
        </div>
        <button class="modal-close-btn" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body" style="padding:1.5rem; line-height:1.5;">
        <p style="font-size:13.5px; color:var(--text-secondary); margin-top:0;">
          No mail goes out from this screen. A new person sets their own password with a password link: it is shown once, here, and you hand it over in person.
        </p>

        <div style="margin-top:1.25rem;">
          <label style="display:block; font-size:12px; font-weight:600; color:var(--text-muted); margin-bottom:6px;">ONE-TIME ACCESS LINK</label>
          <div style="display:flex; gap:8px;">
            <input type="text" id="ur-pwd-link-input" readonly value="${passUrl}" style="flex:1; padding:9px 12px; font-size:12.5px; font-family:var(--font-mono); background:var(--bg-card-subtle); border:1px solid var(--border-default); border-radius:6px; color:var(--text-primary);" />
            <button class="ur-btn-primary" onclick="copyPasswordLinkToClipboard()" id="ur-copy-link-btn">
              <span class="material-symbols-outlined" style="font-size:16px;">content_copy</span>
              <span>Copy</span>
            </button>
          </div>
        </div>

        <div style="margin-top:1.25rem; padding:12px; background:rgba(245, 158, 11, 0.1); border:1px solid rgba(245, 158, 11, 0.3); border-radius:6px; font-size:12.5px; color:var(--text-secondary); display:flex; gap:10px; align-items:flex-start;">
          <span class="material-symbols-outlined" style="color:#d97706; font-size:18px; margin-top:1px;">info</span>
          <div>Deze link is 24 uur geldig voor éénmalige invoer. De uitgifte is gelogd in de security audit history.</div>
        </div>
      </div>
      <div class="modal-footer" style="display:flex; justify-content:flex-end; padding:1rem 1.5rem; border-top:1px solid var(--border-subtle); background:var(--bg-card-header);">
        <button class="ur-btn-primary" onclick="closeModal()">Gereed</button>
      </div>
    </div>
  `;
  overlay.classList.add('visible');
}
window.makePasswordLinkForSelectedUser = makePasswordLinkForSelectedUser;

function copyPasswordLinkToClipboard() {
  const input = document.getElementById('ur-pwd-link-input');
  const btn = document.getElementById('ur-copy-link-btn');
  if (input) {
    input.select();
    navigator.clipboard.writeText(input.value).then(() => {
      if (btn) btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">check</span><span>Gekopieerd!</span>';
      showToast('Gekopieerd', 'Wachtwoordlink is gekopieerd naar het klembord.', 'success');
      setTimeout(() => {
        if (btn) btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">content_copy</span><span>Copy</span>';
      }, 2500);
    });
  }
}
window.copyPasswordLinkToClipboard = copyPasswordLinkToClipboard;

function toggleSelectedUserActiveStatus() {
  const user = ALL_USERS_DATA.find(u => u.id === currentUrSelectedUserId);
  if (!user) return;

  const isDeactivating = user.status === 'Active';
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;

  overlay.innerHTML = `
    <div class="modal-card" style="max-width:500px;" onclick="event.stopPropagation()">
      <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; padding:1.25rem 1.5rem; border-bottom:1px solid var(--border-subtle);">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="material-symbols-outlined" style="color:${isDeactivating ? '#ef4444' : '#10b981'};">${isDeactivating ? 'person_off' : 'person_check'}</span>
          <h3 style="margin:0; font-size:17px; font-weight:700;">${isDeactivating ? 'Deactivate' : 'Activate'} ${user.name}</h3>
        </div>
        <button class="modal-close-btn" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body" style="padding:1.5rem; line-height:1.5;">
        <p style="font-size:13.5px; color:var(--text-secondary); margin-top:0;">
          ${isDeactivating ? 'Nobody is deleted. A person who leaves is deactivated: every act they ever performed stays in the file with their name on it. They can no longer sign in.' : 'Activating this account will allow the person to log in and exercise their assigned roles.'}
        </p>

        <div style="margin-top:1.25rem;">
          <label style="display:block; font-size:12.5px; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">Reason for this change (required)</label>
          <textarea id="ur-status-change-reason" class="ur-textarea" placeholder="Explain the reason for ${isDeactivating ? 'deactivating' : 'activating'} this person..." rows="3"></textarea>
        </div>
      </div>
      <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:10px; padding:1rem 1.5rem; border-top:1px solid var(--border-subtle); background:var(--bg-card-header);">
        <button class="ur-btn-secondary" onclick="closeModal()">Annuleren</button>
        <button class="${isDeactivating ? 'ur-btn-danger-outline' : 'ur-btn-primary'}" onclick="confirmUserStatusChange('${user.id}', '${isDeactivating ? 'Deactivated' : 'Active'}')">
          ${isDeactivating ? 'Deactivate person' : 'Activate person'}
        </button>
      </div>
    </div>
  `;
  overlay.classList.add('visible');
}
window.toggleSelectedUserActiveStatus = toggleSelectedUserActiveStatus;

function confirmUserStatusChange(userId, newStatus) {
  const user = ALL_USERS_DATA.find(u => u.id === userId);
  if (!user) return;

  const reasonInput = document.getElementById('ur-status-change-reason');
  const reason = (reasonInput?.value || '').trim();

  if (!reason) {
    showToast('Reden verplicht', 'Vul een reden in om de statuswijziging conform ISO 17021 te archiveren.', 'warning');
    if (reasonInput) reasonInput.focus();
    return;
  }

  user.status = newStatus;

  const now = new Date();
  const dayStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  ROLE_CHANGES_AUDIT_LOG.unshift({
    when: `${dayStr} ${timeStr}`,
    personName: user.name,
    personEmail: user.email,
    roleChange: `Status changed to ${newStatus}`,
    changedBy: 'George',
    reason: reason
  });

  closeModal();
  showToast('Status gewijzigd', `${user.name} is nu ${newStatus}.`, 'success');
  renderUsersRolesTable();
}
window.confirmUserStatusChange = confirmUserStatusChange;

function switchUsersRolesTab(tab) {
  currentUrTab = tab;
  const peopleBtn = document.getElementById('ur-tab-people');
  const changesBtn = document.getElementById('ur-tab-changes');
  const peoplePane = document.getElementById('ur-pane-people');
  const changesPane = document.getElementById('ur-pane-changes');

  if (tab === 'people') {
    if (peopleBtn) peopleBtn.classList.add('active');
    if (changesBtn) changesBtn.classList.remove('active');
    if (peoplePane) peoplePane.classList.remove('hidden');
    if (changesPane) changesPane.classList.add('hidden');
    renderUsersRolesTable();
  } else {
    if (peopleBtn) peopleBtn.classList.remove('active');
    if (changesBtn) changesBtn.classList.add('active');
    if (peoplePane) peoplePane.classList.add('hidden');
    if (changesPane) changesPane.classList.remove('hidden');
    renderRoleChangesTable();
  }
}
window.switchUsersRolesTab = switchUsersRolesTab;

function renderRoleChangesTable() {
  const tbody = document.getElementById('ur-changes-tbody');
  if (!tbody) return;

  const query = (document.getElementById('ur-changes-search')?.value || '').trim().toLowerCase();
  const filtered = ROLE_CHANGES_AUDIT_LOG.filter(log => {
    if (!query) return true;
    return log.personName.toLowerCase().includes(query) ||
           log.personEmail.toLowerCase().includes(query) ||
           log.changedBy.toLowerCase().includes(query) ||
           log.reason.toLowerCase().includes(query) ||
           log.roleChange.toLowerCase().includes(query);
  });

  const countLabel = document.getElementById('ur-changes-count-label');
  if (countLabel) {
    countLabel.textContent = `Showing ${filtered.length} of ${ROLE_CHANGES_AUDIT_LOG.length} recorded changes`;
  }

  const changesCountPill = document.getElementById('ur-count-changes');
  if (changesCountPill) {
    changesCountPill.textContent = ROLE_CHANGES_AUDIT_LOG.length;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding:3rem; color:var(--text-muted);">
          Geen rolwijzigingen gevonden die voldoen aan de zoekterm.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(log => `
    <tr>
      <td style="font-size:12.5px; color:var(--text-muted); font-family:var(--font-mono); white-space:nowrap;">
        ${log.when}
      </td>
      <td>
        <div style="font-weight:600; color:var(--text-primary); font-size:13.5px;">${log.personName}</div>
        <div style="font-size:12px; color:var(--text-muted);">${log.personEmail}</div>
      </td>
      <td>
        <span class="ur-role-pill" style="background:rgba(37, 99, 235, 0.12); color:#2563eb; border-color:rgba(37,99,235,0.25); font-size:12px;">
          ${log.roleChange}
        </span>
      </td>
      <td style="font-size:13px; color:var(--text-secondary); font-weight:500;">
        ${log.changedBy}
      </td>
      <td style="font-size:12.5px; color:var(--text-secondary); line-height:1.4;">
        ${log.reason}
      </td>
    </tr>
  `).join('');
}
window.renderRoleChangesTable = renderRoleChangesTable;

function filterRoleChanges() {
  renderRoleChangesTable();
}
window.filterRoleChanges = filterRoleChanges;

function toggleUrExplainer() {
  const header = document.querySelector('.ur-explainer-header');
  const content = document.getElementById('ur-explainer-content');
  const chevron = document.getElementById('ur-explainer-chevron');

  if (content) {
    const isHidden = content.classList.toggle('hidden');
    if (header) header.classList.toggle('collapsed', isHidden);
    if (chevron) chevron.textContent = isHidden ? 'expand_more' : 'expand_less';
  }
}
window.toggleUrExplainer = toggleUrExplainer;

function openAddPersonModal() {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;

  overlay.innerHTML = `
    <div class="modal-card" style="max-width:580px;" onclick="event.stopPropagation()">
      <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; padding:1.25rem 1.5rem; border-bottom:1px solid var(--border-subtle);">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="material-symbols-outlined" style="color:#2563eb;">person_add</span>
          <h3 style="margin:0; font-size:17px; font-weight:700;">Add a person</h3>
        </div>
        <button class="modal-close-btn" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body" style="padding:1.5rem; max-height:70vh; overflow-y:auto;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">
          <div>
            <label style="display:block; font-size:12.5px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">Full name *</label>
            <input type="text" id="new-user-name" class="ur-search-input" style="padding-left:12px;" placeholder="e.g. S. de Vries" required />
          </div>
          <div>
            <label style="display:block; font-size:12.5px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">E-mail address *</label>
            <input type="email" id="new-user-email" class="ur-search-input" style="padding-left:12px;" placeholder="name@auditindepender.com" required />
          </div>
        </div>

        <label class="ur-checkbox-label" style="margin-bottom:16px;">
          <input type="checkbox" id="new-user-practice" />
          <span>This is a practice / rehearsal account (@example.test)</span>
        </label>

        <div class="ur-section-title" style="margin-top:12px;">ASSIGN INITIAL ROLES</div>
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
          ${ROLE_DEFINITIONS.map(r => `
            <label class="ur-check-item">
              <input type="checkbox" name="new-user-role-check" value="${r.id}" />
              <div class="ur-check-content">
                <span class="ur-check-title">${r.title}</span>
                <span style="font-size:12px; color:var(--text-muted);">${r.desc}</span>
              </div>
            </label>
          `).join('')}
        </div>

        <div class="ur-section-title">ALSO</div>
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
          ${ALSO_DEFINITIONS.map(a => `
            <label class="ur-check-item">
              <input type="checkbox" name="new-user-also-check" value="${a.id}" />
              <div class="ur-check-content">
                <span class="ur-check-title">${a.title}</span>
                <span style="font-size:12px; color:var(--text-muted);">${a.desc}</span>
              </div>
            </label>
          `).join('')}
        </div>

        <div>
          <label style="display:block; font-size:12.5px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">Reason for adding this person (required) *</label>
          <textarea id="new-user-reason" class="ur-textarea" placeholder="Explain why this account is created..." rows="2"></textarea>
        </div>
      </div>
      <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:10px; padding:1rem 1.5rem; border-top:1px solid var(--border-subtle); background:var(--bg-card-header);">
        <button class="ur-btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="ur-btn-primary" onclick="submitAddNewPerson()">Create person</button>
      </div>
    </div>
  `;
  overlay.classList.add('visible');
}
window.openAddPersonModal = openAddPersonModal;

function submitAddNewPerson() {
  const nameInput = document.getElementById('new-user-name');
  const emailInput = document.getElementById('new-user-email');
  const reasonInput = document.getElementById('new-user-reason');
  const isPractice = document.getElementById('new-user-practice')?.checked ?? false;

  const name = (nameInput?.value || '').trim();
  const email = (emailInput?.value || '').trim();
  const reason = (reasonInput?.value || '').trim();

  if (!name || !email) {
    showToast('Invoer ontbreekt', 'Naam en e-mailadres zijn verplicht.', 'warning');
    return;
  }
  if (!reason) {
    showToast('Reden verplicht', 'Voer een reden in voor het toevoegen van deze gebruiker in de audit trail.', 'warning');
    return;
  }

  const checkedRoles = Array.from(document.querySelectorAll('input[name="new-user-role-check"]:checked')).map(cb => cb.value);
  const checkedAlso = Array.from(document.querySelectorAll('input[name="new-user-also-check"]:checked')).map(cb => cb.value);

  const newId = 'user-' + name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const newUser = {
    id: newId,
    name: name,
    email: email,
    roles: checkedRoles,
    status: 'Active',
    lastSignedIn: 'not recorded yet',
    isPractice: isPractice,
    technicalStaff: checkedAlso.includes('technicalStaff'),
    impartialityCommittee: checkedAlso.includes('impartialityCommittee')
  };

  ALL_USERS_DATA.push(newUser);

  const now = new Date();
  const dayStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  ROLE_CHANGES_AUDIT_LOG.unshift({
    when: `${dayStr} ${timeStr}`,
    personName: name,
    personEmail: email,
    roleChange: checkedRoles.length > 0 ? checkedRoles.map(r => `+ ${r}`).join(', ') : 'Account created (no roles)',
    changedBy: 'George',
    reason: reason
  });

  closeModal();
  showToast('Medewerker aangemaakt', `${name} is succesvol toegevoegd. Maak nu een wachtwoordlink aan.`, 'success');

  currentUrSelectedUserId = newId;
  renderUsersRolesTable();
  selectUserForDrawer(newId);
}
window.submitAddNewPerson = submitAddNewPerson;

function showUsersRolesExplainerModal() {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;

  overlay.innerHTML = `
    <div class="modal-card" style="max-width:580px;" onclick="event.stopPropagation()">
      <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; padding:1.25rem 1.5rem; border-bottom:1px solid var(--border-subtle);">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="material-symbols-outlined" style="color:#2563eb;">info</span>
          <h3 style="margin:0; font-size:17px; font-weight:700;">About Users and Roles</h3>
        </div>
        <button class="modal-close-btn" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body" style="padding:1.5rem; line-height:1.6; font-size:13.5px; color:var(--text-secondary);">
        <p>A role decides what someone may see and do. It never lifts the rule that whoever assessed a dossier cannot decide on it. Every change is recorded with who made it and why.</p>
        <p><strong>No mail goes out from this screen:</strong> A new person sets their own password with a password link: it is shown once, here, and you hand it over in person.</p>
        <p><strong>Nobody is deleted:</strong> A person who leaves is deactivated: every act they ever performed stays in the file with their name on it.</p>
        <p><strong>«Also» options:</strong> technical staff and the impartiality committee are structural roles for impartiality compliance rather than screens.</p>
      </div>
      <div class="modal-footer" style="display:flex; justify-content:flex-end; padding:1rem 1.5rem; border-top:1px solid var(--border-subtle); background:var(--bg-card-header);">
        <button class="ur-btn-primary" onclick="closeModal()">Sluiten</button>
      </div>
    </div>
  `;
  overlay.classList.add('visible');
}
window.showUsersRolesExplainerModal = showUsersRolesExplainerModal;



// Toggle role switcher dropdown
function toggleRoleSwitcher() {
  const dropdown = document.getElementById('role-switcher-dropdown');
  if (dropdown) dropdown.classList.toggle('visible');
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  const switcher = document.getElementById('role-switcher-wrap');
  const dropdown = document.getElementById('role-switcher-dropdown');
  if (switcher && dropdown && !switcher.contains(e.target)) {
    dropdown.classList.remove('visible');
  }
});

// Origin tracking for back navigation
let currentOriginView = 'dossiers'; // 'worklist' | 'dossiers' | 'establishment'
let currentDossiersTab = 'open'; // 'open' | 'closed'
let currentActiveEstablishment = null;

// ─── Database of Establishments (From screenshots) ───
const ALL_ESTABLISHMENTS = [
  {
    reference: 'GK01357',
    name: 'Amrâth Berghotel Amersfoort',
    country: 'NL',
    countryFull: 'Netherlands',
    nationalOperator: 'KMVK (Netherlands)',
    categories: ['HH'],
    categoryType: 'Hotels and hostels',
    expiry: '29 Apr 2027',
    expirySub: '',
    status: 'Dossier opened',
    dossierNumber: 'A-2026-00014',
    dossierState: 'Pre-screening',
    dossierOpened: '24 Sep 2026',
    step: 1,
    details: [
      { field: 'Application status', value: 'Not delivered', source: '', since: '' },
      { field: 'Category', value: 'Not delivered', source: '', since: '' },
      { field: 'Chain name', value: 'None', source: 'FEE export of 15 September 2026 (GK26_09.xlsx, tab «Green Key (FEE)»)', since: '24 Sep 2026' },
      { field: 'Chain reference', value: 'Not delivered', source: '', since: '' },
      { field: 'City', value: 'Amersfoort', source: 'Planning export of 15 September 2026', since: '24 Sep 2026' },
      { field: 'Country', value: 'Netherlands', source: 'Planning export of 15 September 2026', since: '24 Sep 2026' },
      { field: 'Decision date', value: 'Not delivered', source: '', since: '' },
      { field: 'Certificate expires, from the National Operator', value: 'Not delivered', source: '', since: '' },
      { field: 'Certificate expires', value: '2027-04-29', source: 'Planning export of 15 September 2026', since: '24 Sep 2026' },
      { field: 'First certified in', value: 'Not delivered', source: '', since: '' },
      { field: 'Number of staff (FTE)', value: 'Not delivered', source: '', since: '' },
      { field: 'General e-mail address', value: 'Not delivered', source: '', since: '' },
      { field: 'General telephone', value: 'Not delivered', source: '', since: '' },
      { field: 'Invoice address', value: 'Not delivered', source: '', since: '' },
      { field: 'Invoice to (name)', value: 'Not delivered', source: '', since: '' },
      { field: 'Certificate issued, from the National Operator', value: 'Not delivered', source: '', since: '' },
      { field: 'Certificate issued', value: 'Not delivered', source: '', since: '' },
      { field: 'Language', value: 'Not delivered', source: '', since: '' },
      { field: 'Latitude', value: '52.1434169', source: 'Planning export of 15 September 2026', since: '24 Sep 2026' },
      { field: 'Longitude', value: '5.3644563', source: 'Planning export of 15 September 2026', since: '24 Sep 2026' },
      { field: 'Name', value: 'Amrâth Berghotel Amersfoort', source: 'FEE export of 15 September 2026 (GK26_09.xlsx, tab «Green Key (FEE)»)', since: '24 Sep 2026' },
      { field: 'National Operator', value: 'Not delivered', source: '', since: '' },
      { field: 'Postal code', value: '3818 EG', source: 'FEE export of 15 September 2026 (GK26_09.xlsx, tab «Green Key (FEE)»)', since: '24 Sep 2026' },
      { field: 'Contact e-mail address', value: 'Not delivered', source: '', since: '' },
      { field: 'Contact person', value: 'Not delivered', source: '', since: '' },
      { field: 'Contact telephone', value: 'Not delivered', source: '', since: '' },
      { field: 'Contact position', value: 'Not delivered', source: '', since: '' },
      { field: 'Region', value: 'Utrecht', source: 'FEE export of 15 September 2026 (GK26_09.xlsx, tab «Green Key (FEE)»)', since: '24 Sep 2026' },
      { field: 'Number of rooms or beds', value: 'Not delivered', source: '', since: '' },
      { field: 'Street', value: 'Utrechtseweg 225', source: 'FEE export of 15 September 2026 (GK26_09.xlsx, tab «Green Key (FEE)»)', since: '24 Sep 2026' },
      { field: 'Province or state', value: 'Not delivered', source: '', since: '' },
      { field: 'Validation state', value: 'Not delivered', source: '', since: '' },
      { field: 'VAT number', value: 'Not delivered', source: '', since: '' },
      { field: 'Website', value: 'https://www.amrathberghotelamersfoort.nl/', source: 'FEE export of 15 September 2026 (GK26_09.xlsx, tab «Green Key (FEE)»)', since: '24 Sep 2026' }
    ]
  },
  {
    reference: 'GK03227',
    name: 'Park Inn by Radisson Linz',
    country: 'AT',
    countryFull: 'Austria',
    nationalOperator: 'None in the source — no link can be issued yet',
    categories: ['HH'],
    categoryType: 'Hotels and hostels',
    expiry: '28 Jul 2027',
    expirySub: '',
    status: 'No dossier yet',
    dossierNumber: 'A-2026-00018',
    dossierState: 'Application',
    dossierOpened: '1 Oct 2026',
    step: 1
  },
  {
    reference: 'GK03232',
    name: 'Baalse Hei',
    country: 'BE',
    countryFull: 'Belgium',
    nationalOperator: 'GoodPlanet (Belgium)',
    categories: ['CHP'],
    categoryType: 'Campsites and holiday parks',
    expiry: '30 Jun 2027',
    expirySub: '',
    status: 'Dossier opened',
    dossierNumber: 'A-2025-00002',
    dossierState: 'Suspended',
    dossierOpened: '15 Aug 2025',
    step: 8
  },
  {
    reference: 'GK03233',
    name: 'De Hoge Rielen',
    country: 'BE',
    countryFull: 'Belgium',
    nationalOperator: 'GoodPlanet (Belgium)',
    categories: ['HH'],
    categoryType: 'Hotels and hostels',
    expiry: '31 Dec 2026',
    expirySub: 'collection value, not a measured date',
    status: 'Dossier opened',
    dossierNumber: 'A-2026-00003',
    dossierState: 'In review',
    dossierOpened: '16 Oct 2025',
    step: 5
  },
  {
    reference: 'GK03237',
    name: 'Domein Roosendael Grachthuis, Koetshuis, Landhuis',
    country: 'BE',
    countryFull: 'Belgium',
    nationalOperator: 'GoodPlanet (Belgium)',
    categories: ['HH'],
    categoryType: 'Hotels and hostels',
    expiry: '30 Jun 2027',
    expirySub: '',
    status: 'Dossier opened',
    dossierNumber: 'A-2026-00025',
    dossierState: 'In review',
    dossierOpened: '18 Sep 2026',
    step: 5
  },
  {
    reference: 'GK03239',
    name: 'Hidrodoe',
    country: 'BE',
    countryFull: 'Belgium',
    nationalOperator: 'GoodPlanet (Belgium)',
    categories: ['A'],
    categoryType: 'Attractions',
    expiry: '31 Dec 2026',
    expirySub: 'collection value, not a measured date',
    status: 'Dossier opened',
    dossierNumber: 'A-2026-00026',
    dossierState: 'Under surveillance',
    dossierOpened: '20 Sep 2026',
    step: 8
  },
  {
    reference: 'GK03241',
    name: 'Holiday Inn Express Antwerp City North',
    country: 'BE',
    countryFull: 'Belgium',
    nationalOperator: 'None — no link can be issued yet',
    categories: ['HH'],
    categoryType: 'Hotels and hostels',
    expiry: '30 Jun 2027',
    expirySub: '',
    status: 'Dossier opened',
    dossierNumber: 'A-2026-00027',
    dossierState: 'Pre-screening',
    dossierOpened: '28 Sep 2026',
    step: 1
  },
  {
    reference: 'GK03242',
    name: 'Holiday Inn Express Mechelen City Centre',
    country: 'BE',
    countryFull: 'Belgium',
    nationalOperator: 'GoodPlanet (Belgium)',
    categories: ['HH'],
    categoryType: 'Hotels and hostels',
    expiry: '30 Jun 2027',
    expirySub: '',
    status: 'Dossier opened',
    dossierNumber: 'A-2026-00028',
    dossierState: 'In review',
    dossierOpened: '29 Sep 2026',
    step: 5
  },
  {
    reference: 'GK03245',
    name: 'Jeugdherberg Pulcinella',
    country: 'BE',
    countryFull: 'Belgium',
    nationalOperator: 'GoodPlanet (Belgium)',
    categories: ['HH'],
    categoryType: 'Hotels and hostels',
    expiry: '30 Jun 2027',
    expirySub: '',
    status: 'Dossier opened',
    dossierNumber: 'A-2026-00029',
    dossierState: 'Pre-screening',
    dossierOpened: '30 Sep 2026',
    step: 1
  },
  {
    reference: 'GK03251',
    name: 'Provinciaal Recreatiedomein Zilvermeer',
    country: 'BE',
    countryFull: 'Belgium',
    nationalOperator: 'GoodPlanet (Belgium)',
    categories: ['CHP'],
    categoryType: 'Campsites and holiday parks',
    expiry: '31 Dec 2026',
    expirySub: 'collection value, not a measured date',
    status: 'Dossier opened',
    dossierNumber: 'A-2026-00030',
    dossierState: 'Under surveillance',
    dossierOpened: '1 Oct 2026',
    step: 8
  }
];

const EST_MAP = {};
ALL_ESTABLISHMENTS.forEach(e => {
  EST_MAP[e.reference] = e;
});

// ─── Database of Dossiers ───
const ALL_DOSSIERS = [
  // OPEN DOSSIERS
  {
    statusGroup: 'open',
    number: 'A-2025-00002',
    gkId: 'GK90014',
    name: 'Vakantiepark Schetsmatig',
    country: 'Belgium',
    type: 'First certification',
    state: 'Suspended',
    waitingOn: 'Us · Coordinator',
    waitingDetail: 'informs the scheme owner',
    deadlineTitle: '418 days overdue · 15 Aug 2025',
    deadlineSub: 'Certification body informs the sche...',
    deadlineType: 'overdue',
    categories: 'HH',
    route: 'The ordinary certification cycle of this scheme.',
    step: 8
  },
  {
    statusGroup: 'open',
    number: 'A-2025-00003',
    gkId: 'GK90018',
    name: 'Restaurant De Voetnoot',
    country: 'Germany',
    type: 'First certification',
    state: 'Under surveillance',
    waitingOn: 'Us · Coordinator',
    waitingDetail: 'informs the scheme owner',
    deadlineTitle: '357 days overdue · 15 Oct 2025',
    deadlineSub: 'Certification body informs the sche...',
    deadlineType: 'overdue',
    categories: 'HH',
    route: 'The ordinary certification cycle of this scheme.',
    step: 8
  },
  {
    statusGroup: 'open',
    number: 'A-2025-00004',
    gkId: 'GK90011',
    name: 'Restaurant Vier Gangen',
    country: 'Germany',
    type: 'First certification',
    state: 'Under surveillance',
    waitingOn: 'Us · Coordinator',
    waitingDetail: 'informs the scheme owner',
    deadlineTitle: '317 days overdue · 24 Nov 2025',
    deadlineSub: 'Certification body informs the sche...',
    deadlineType: 'overdue',
    categories: 'HH',
    route: 'The ordinary certification cycle of this scheme.',
    step: 8
  },
  {
    statusGroup: 'open',
    number: 'A-2025-00005',
    gkId: 'GK90012',
    name: 'Hotel Kladblok',
    country: 'Germany',
    type: 'First certification',
    state: 'Under surveillance',
    waitingOn: 'Us · Coordinator',
    waitingDetail: 'informs the scheme owner',
    deadlineTitle: '223 days overdue · 26 Feb 2026',
    deadlineSub: 'Certification body informs the sche...',
    deadlineType: 'overdue',
    categories: 'HH',
    route: 'The ordinary certification cycle of this scheme.',
    step: 8
  },
  {
    statusGroup: 'open',
    number: 'A-2026-00001',
    gkId: 'GK90009',
    name: 'Bed en Ontbijt De Marge',
    country: 'Netherlands',
    type: 'First certification',
    state: 'In review',
    waitingOn: 'Us · Reviewer',
    waitingDetail: 'assesses the dossier',
    deadlineTitle: 'Today · 8 Oct 2026',
    deadlineSub: 'Certification body review and draft decision',
    deadlineType: 'today',
    categories: 'HH',
    route: 'The ordinary certification cycle of this scheme.',
    step: 5
  },
  {
    statusGroup: 'open',
    number: 'A-2026-00003',
    gkId: 'GK90008',
    name: 'Hotel Spiegelgracht',
    country: 'Belgium',
    type: 'First certification',
    state: 'In review',
    waitingOn: 'Us · Reviewer',
    waitingDetail: 'assesses the dossier',
    deadlineTitle: 'In 9 days · 16 Oct 2026',
    deadlineSub: 'Certification body review and d...',
    deadlineType: 'later',
    categories: 'HH',
    route: 'The ordinary certification cycle of this scheme.',
    step: 5
  },
  {
    statusGroup: 'open',
    number: 'A-2026-00014',
    gkId: 'GK01357',
    name: 'Amrâth Berghotel Amersfoort',
    country: 'Netherlands',
    type: 'First certification',
    state: 'Pre-screening',
    waitingOn: 'Us · Coordinator',
    waitingDetail: 'writes outcome of pre-screening',
    deadlineTitle: 'In 4 days · 12 Oct 2026',
    deadlineSub: 'Pre-screening outcome pending',
    deadlineType: 'later',
    categories: 'HH',
    route: 'The ordinary certification cycle of this scheme.',
    step: 1
  },
  {
    statusGroup: 'open',
    number: 'A-2026-00019',
    gkId: 'GK01362',
    name: 'Camping De Paalberg',
    country: 'Netherlands',
    type: 'First certification',
    state: 'Pre-screening completed',
    waitingOn: 'Us · Coordinator',
    waitingDetail: 'prices the commission',
    deadlineTitle: 'In 10 days · 18 Oct 2026',
    deadlineSub: 'Price commission and invoice fee',
    deadlineType: 'later',
    categories: 'CP',
    route: 'The ordinary certification cycle of this scheme.',
    step: 2
  },
  {
    statusGroup: 'open',
    number: 'A-2026-00016',
    gkId: 'GK01359',
    name: 'Strandhotel Het Hoge Duin',
    country: 'Netherlands',
    type: 'First certification',
    state: 'Invoice sent',
    waitingOn: 'Us · Coordinator',
    waitingDetail: 'confirms audit fee payment',
    deadlineTitle: 'In 14 days · 22 Oct 2026',
    deadlineSub: 'Payment registration pending',
    deadlineType: 'later',
    categories: 'HH',
    route: 'The ordinary certification cycle of this scheme.',
    step: 3
  },
  {
    statusGroup: 'open',
    number: 'A-2026-00012',
    gkId: 'GK01358',
    name: 'Van der Valk Hotel Breukelen',
    country: 'Netherlands',
    type: 'First certification',
    state: 'Payment received',
    waitingOn: 'Us · Scheduler',
    waitingDetail: 'assigns auditor for category HH',
    deadlineTitle: 'In 7 days · 15 Oct 2026',
    deadlineSub: 'Auditor assignment pending',
    deadlineType: 'later',
    categories: 'HH',
    route: 'The ordinary certification cycle of this scheme.',
    step: 4
  },
  {
    statusGroup: 'open',
    number: 'A-2026-00006',
    gkId: 'GK90022',
    name: 'NH Collection Amsterdam Barbizon',
    country: 'Netherlands',
    type: 'First certification',
    state: 'Audit completed',
    waitingOn: 'Us · Reviewer',
    waitingDetail: 'assesses the dossier quality review',
    deadlineTitle: 'In 4 days · 12 Oct 2026',
    deadlineSub: 'Quality review pending',
    deadlineType: 'later',
    categories: 'HH',
    route: 'The ordinary certification cycle of this scheme.',
    step: 6
  },
  {
    statusGroup: 'open',
    number: 'A-2025-00021',
    gkId: 'GK90025',
    name: 'Postillion Hotel Arnhem',
    country: 'Netherlands',
    type: 'First certification',
    state: 'Decision drafting',
    waitingOn: 'Certification Body',
    waitingDetail: 'formulates draft certification decision',
    deadlineTitle: 'In 11 days · 19 Oct 2026',
    deadlineSub: 'Draft decision pending',
    deadlineType: 'later',
    categories: 'HH',
    route: 'The ordinary certification cycle of this scheme.',
    step: 7
  },
  {
    statusGroup: 'open',
    number: 'A-2026-00025',
    gkId: 'GK01365',
    name: 'Fletcher Hotel Loosdrecht-Amsterdam',
    country: 'Netherlands',
    type: 'First certification',
    state: 'Audit in progress',
    waitingOn: 'Auditor · J. van Dam',
    waitingDetail: 'completes on-site audit report and findings',
    deadlineTitle: 'Today · 8 Oct 2026',
    deadlineSub: 'On-site inspection protocol & checklist',
    deadlineType: 'today',
    categories: 'HH',
    route: 'The ordinary certification cycle of this scheme.',
    step: 5
  },
  {
    statusGroup: 'open',
    number: 'A-2026-00028',
    gkId: 'GK01370',
    name: 'Landgoed Lauswolt',
    country: 'Netherlands',
    type: 'First certification',
    state: 'Corrective action',
    waitingOn: 'Establishment · Manager',
    waitingDetail: 'submits corrective action plan (CAP)',
    deadlineTitle: 'In 18 days · 26 Oct 2026',
    deadlineSub: 'Corrective actions on audit non-conformities',
    deadlineType: 'later',
    categories: 'HH',
    route: 'The ordinary certification cycle of this scheme.',
    step: 6
  },

  // CLOSED DOSSIERS
  {
    statusGroup: 'closed',
    number: 'A-2024-00018',
    gkId: 'GK90001',
    name: 'Strandhotel Duinzicht',
    country: 'Netherlands',
    type: 'First certification',
    state: 'Refused',
    waitingOn: 'Closed',
    waitingDetail: 'process concluded',
    deadlineTitle: 'Archived · 12 Dec 2024',
    deadlineSub: 'Final refusal recorded',
    deadlineType: 'later',
    categories: 'HH',
    route: 'The ordinary certification cycle of this scheme.',
    step: 6
  },
  {
    statusGroup: 'closed',
    number: 'A-2024-00022',
    gkId: 'GK90002',
    name: 'Grand Hotel Central',
    country: 'Belgium',
    type: 'First certification',
    state: 'Certified',
    waitingOn: 'Closed',
    waitingDetail: 'transferred to cycle 2',
    deadlineTitle: 'Archived · 5 Jan 2025',
    deadlineSub: 'Successfully concluded cycle',
    deadlineType: 'later',
    categories: 'HH',
    route: 'The ordinary certification cycle of this scheme.',
    step: 8
  }
];

const DOSSIER_MAP = {};
ALL_DOSSIERS.forEach(d => {
  DOSSIER_MAP[d.number] = d;
});

// Register rehearsal practice establishments & dossiers from pool into maps
const PRACTICE_ESTABLISHMENTS_POOL = [
  { num: 16, ref: 'GK90016', name: 'GK90016 — Attractie De Draaimolen', country: 'NL', countryFull: 'Netherlands', operator: 'Stichting KMVK', cat: ['A'], catType: 'Attractions', status: 'Dossier opened', expiry: '31 Dec 2026' },
  { num: 14, ref: 'GK90014', name: 'GK90014 — Vakantiepark Schetsmatig', country: 'BE', countryFull: 'Belgium', operator: 'GoodPlanet (Belgium)', cat: ['HH'], catType: 'Holiday parks', status: 'Dossier opened', expiry: '30 Jun 2027' },
  { num: 18, ref: 'GK90018', name: 'GK90018 — Restaurant De Voetnoot', country: 'NL', countryFull: 'Netherlands', operator: 'Stichting KMVK', cat: ['R'], catType: 'Restaurants', status: 'Dossier opened', expiry: '31 Dec 2026' },
  { num: 1, ref: 'GK90001', name: 'GK90001 — Hotel Het Veerhuis', country: 'NL', countryFull: 'Netherlands', operator: 'Stichting KMVK', cat: ['HH'], catType: 'Hotels and hostels', status: 'Dossier opened', expiry: '31 Dec 2026' },
  { num: 8, ref: 'GK90008', name: 'GK90008 — Camping Duinenzicht', country: 'NL', countryFull: 'Netherlands', operator: 'Stichting KMVK', cat: ['C'], catType: 'Campings', status: 'Dossier opened', expiry: '31 Dec 2026' },
  { num: 22, ref: 'GK90022', name: 'GK90022 — Bungalowpark De Sparren', country: 'NL', countryFull: 'Netherlands', operator: 'Stichting KMVK', cat: ['HH'], catType: 'Holiday parks', status: 'Dossier opened', expiry: '30 Jun 2027' },
  { num: 33, ref: 'GK90033', name: 'GK90033 — Grand Café De Haven', country: 'NL', countryFull: 'Netherlands', operator: 'Stichting KMVK', cat: ['R'], catType: 'Restaurants', status: 'Dossier opened', expiry: '31 Dec 2026' },
  { num: 5, ref: 'GK90005', name: 'GK90005 — Conferentiecentrum Bosrijk', country: 'NL', countryFull: 'Netherlands', operator: 'Stichting KMVK', cat: ['C'], catType: 'Conference centres', status: 'Dossier opened', expiry: '31 Dec 2026' },
  { num: 12, ref: 'GK90012', name: 'GK90012 — Strandhotel Zeelust', country: 'NL', countryFull: 'Netherlands', operator: 'Stichting KMVK', cat: ['HH'], catType: 'Hotels and hostels', status: 'Dossier opened', expiry: '30 Jun 2027' },
  { num: 25, ref: 'GK90025', name: 'GK90025 — B&B Het Groene Woud', country: 'NL', countryFull: 'Netherlands', operator: 'Stichting KMVK', cat: ['HH'], catType: 'Bed & Breakfast', status: 'Dossier opened', expiry: '31 Dec 2026' }
];

PRACTICE_ESTABLISHMENTS_POOL.forEach(p => {
  const dNumber = `A-2025-${String(p.num).padStart(5, '0')}`;
  if (!EST_MAP[p.ref]) {
    const estObj = {
      reference: p.ref,
      name: p.name,
      country: p.country,
      countryFull: p.countryFull,
      nationalOperator: p.operator,
      categories: p.cat,
      categoryType: p.catType,
      expiry: p.expiry,
      expirySub: '',
      status: p.status,
      dossierNumber: dNumber,
      dossierState: 'In review',
      dossierOpened: '10 Jan 2025',
      step: 5
    };
    ALL_ESTABLISHMENTS.push(estObj);
    EST_MAP[p.ref] = estObj;
  }
  if (!DOSSIER_MAP[dNumber]) {
    const dosObj = {
      statusGroup: 'open',
      number: dNumber,
      gkId: p.ref,
      name: p.name.split('—')[1]?.trim() || p.name,
      country: p.countryFull,
      type: 'Ordinary cycle',
      state: 'In review',
      waitingOn: 'Us · Coordinator',
      waitingDetail: 'audit and review in progress',
      deadlineTitle: 'In progress',
      deadlineSub: 'Deadline monitored by rehearsal system',
      deadlineType: 'today',
      categories: p.cat.join(', '),
      route: 'The ordinary certification cycle of this scheme.',
      step: 5
    };
    ALL_DOSSIERS.push(dosObj);
    DOSSIER_MAP[dNumber] = dosObj;
  }
});

// ─── Database of Auditors (From Parties screenshots) ───
const ALL_AUDITORS = [
  {
    name: 'AIDONIS DIMITRIS',
    country: 'GR',
    countryFull: 'Greece (GR)',
    workArea: 'No work area recorded',
    state: 'Candidate',
    contract: 'Registered',
    lastEvaluated: 'Never recorded',
    legalHold: 'No hold',
    chainsBarred: 'None',
    email: 'auditor-46e0d3dec78d@example.test',
    missingCount: 8,
    missingItems: [
      {
        group: 'NEEDED BEFORE THIS AUDITOR CAN BE PLANNED',
        items: [
          { title: 'Active in the register', desc: 'Now: Candidate.' },
          { title: 'Auditor Agreement, signed and valid', desc: 'Not on file.' },
          { title: 'Auditor Certificate, signed and valid', desc: 'Not on file.' },
          { title: 'Code of Conduct, signed and valid', desc: 'Not on file.' },
          { title: 'Competence for at least one category', desc: 'Nothing recorded: an assignment asks for a category he is qualified for.' },
          { title: 'VAT number', desc: 'Without it the self-billed invoice is not paid out, and he cannot be admitted to the register.' }
        ]
      },
      {
        group: 'NEEDED FOR PRICES AND PAYMENT',
        items: [
          { title: 'Prices', desc: '0 of 0 filled in. Without prices no audit can be paid.' },
          { title: 'Travel base', desc: 'Sets the travel estimate.' }
        ]
      }
    ],
    sourceNote: 'Came in from the list «GR auditors (Data, 28 Sept 2026)», delivered 28 Sep 2026.',
    competence: 'No competence has been recorded.',
    assignments: 'Not assigned to a dossier yet.',
    restrictions: { hold: 'Nothing on file', ties: 'Nothing on file', chains: 'Nothing on file' },
    prices: { linkSent: 'never', desc: 'No prices yet: he is not qualified for any category.', vat: 'None on file', vatSub: 'No VAT number has been recorded for this auditor here.' },
    counts: { prices: '0 of 0', competence: '0', documents: '0', history: '1' },
    signedDocuments: 'No document has been recorded.',
    whereCameFrom: {
      list: 'GR auditors (Data, 28 Sept 2026)',
      country: 'GR',
      delivered: '28 Sep 2026',
      company: 'Q-CERT'
    },
    historyEntries: [
      { date: '5 Oct 2026 20:42', action: 'Recorded', actor: 'The scheduler' }
    ],
    assignmentsDetail: 'This auditor has not been assigned to a dossier.'
  },
  {
    name: 'Aikaterini Drosaki',
    country: 'GR',
    countryFull: 'Greece (GR)',
    workArea: 'No work area recorded',
    state: 'Candidate',
    contract: 'Registered',
    lastEvaluated: 'Never recorded',
    legalHold: 'No hold',
    chainsBarred: 'None',
    email: 'auditor-88f12a3bc41e@example.test',
    missingCount: 8,
    missingItems: [
      {
        group: 'NEEDED BEFORE THIS AUDITOR CAN BE PLANNED',
        items: [
          { title: 'Active in the register', desc: 'Now: Candidate.' },
          { title: 'Auditor Agreement, signed and valid', desc: 'Not on file.' },
          { title: 'Auditor Certificate, signed and valid', desc: 'Not on file.' },
          { title: 'Code of Conduct, signed and valid', desc: 'Not on file.' },
          { title: 'Competence for at least one category', desc: 'Nothing recorded: an assignment asks for a category he is qualified for.' },
          { title: 'VAT number', desc: 'Without it the self-billed invoice is not paid out, and he cannot be admitted to the register.' }
        ]
      },
      {
        group: 'NEEDED FOR PRICES AND PAYMENT',
        items: [
          { title: 'Prices', desc: '0 of 0 filled in. Without prices no audit can be paid.' },
          { title: 'Travel base', desc: 'Sets the travel estimate.' }
        ]
      }
    ],
    sourceNote: 'Came in from the list «GR auditors (Data, 28 Sept 2026)», delivered 28 Sep 2026.',
    competence: 'No competence has been recorded.',
    assignments: 'Not assigned to a dossier yet.',
    restrictions: { hold: 'Nothing on file', ties: 'Nothing on file', chains: 'Nothing on file' },
    prices: { linkSent: 'never', desc: 'No prices yet: he is not qualified for any category.', vat: 'None on file', vatSub: 'No VAT number has been recorded for this auditor here.' },
    counts: { prices: '0 of 0', competence: '0', documents: '0', history: '1' }
  },
  {
    name: 'Alondra Ibáñez Dávila',
    country: 'MX',
    countryFull: 'Mexico (MX)',
    workArea: 'Hotels and hostels (HH)',
    state: 'Active',
    contract: 'Registered',
    lastEvaluated: 'Never recorded',
    legalHold: 'No hold',
    chainsBarred: 'None',
    email: 'auditor-c3d5e789a101@example.test',
    missingCount: 0,
    missingItems: [],
    sourceNote: 'Registered auditor under North America LATAM audit pool.',
    competence: 'Qualified for Hotels & Hostels (HH), Campsites (CHP). Audit experience: 12 audits completed.',
    assignments: 'Assigned to 2 active dossiers in 2026.',
    restrictions: { hold: 'No hold', ties: 'None on file', chains: 'None' },
    prices: { linkSent: '12 Jan 2026', desc: 'Standard audit tariff accepted: €650 / on-site visit.', vat: 'RFC: IBD901024-AA1', vatSub: 'Verified and tax cleared.' },
    counts: { prices: '2 of 2', competence: '2', documents: '3', history: '4' }
  },
  {
    name: 'Amalie Hansen',
    country: 'DK',
    countryFull: 'Denmark (DK)',
    workArea: 'Hotels, Hostels, Campsites',
    state: 'Active',
    contract: 'Registered',
    lastEvaluated: 'Never recorded',
    legalHold: 'No hold',
    chainsBarred: 'None',
    email: 'auditor-99e21bf44d22@example.test',
    missingCount: 0,
    missingItems: [],
    sourceNote: 'Transferred from Nordic Green Key auditor registry 2025.',
    competence: 'Qualified for Hotels (HH), Restaurants (RES), Campsites (CHP). Lead auditor status.',
    assignments: 'Available for international remote and on-site reviews.',
    restrictions: { hold: 'No hold', ties: 'None on file', chains: 'None' },
    prices: { linkSent: '18 Nov 2025', desc: 'Fixed rate accepted: €720 / audit.', vat: 'DK-34981290', vatSub: 'Valid EU VAT number.' },
    counts: { prices: '3 of 3', competence: '3', documents: '3', history: '6' }
  },
  {
    name: 'Andreas Katrakilis',
    country: 'GR',
    countryFull: 'Greece (GR)',
    workArea: 'No work area recorded',
    state: 'Candidate',
    contract: 'Registered',
    lastEvaluated: 'Never recorded',
    legalHold: 'No hold',
    chainsBarred: 'None',
    email: 'auditor-a712f8832c34@example.test',
    missingCount: 8,
    missingItems: [
      {
        group: 'NEEDED BEFORE THIS AUDITOR CAN BE PLANNED',
        items: [
          { title: 'Active in the register', desc: 'Now: Candidate.' },
          { title: 'Auditor Agreement, signed and valid', desc: 'Not on file.' },
          { title: 'Auditor Certificate, signed and valid', desc: 'Not on file.' },
          { title: 'Code of Conduct, signed and valid', desc: 'Not on file.' },
          { title: 'Competence for at least one category', desc: 'Nothing recorded: an assignment asks for a category he is qualified for.' },
          { title: 'VAT number', desc: 'Without it the self-billed invoice is not paid out, and he cannot be admitted to the register.' }
        ]
      },
      {
        group: 'NEEDED FOR PRICES AND PAYMENT',
        items: [
          { title: 'Prices', desc: '0 of 0 filled in. Without prices no audit can be paid.' },
          { title: 'Travel base', desc: 'Sets the travel estimate.' }
        ]
      }
    ],
    sourceNote: 'Came in from the list «GR auditors (Data, 28 Sept 2026)», delivered 28 Sep 2026.',
    competence: 'No competence has been recorded.',
    assignments: 'Not assigned to a dossier yet.',
    restrictions: { hold: 'Nothing on file', ties: 'Nothing on file', chains: 'Nothing on file' },
    prices: { linkSent: 'never', desc: 'No prices yet: he is not qualified for any category.', vat: 'None on file', vatSub: 'No VAT number has been recorded for this auditor here.' },
    counts: { prices: '0 of 0', competence: '0', documents: '0', history: '1' }
  },
  {
    name: 'ANNA ZOPIDOU',
    country: 'GR',
    countryFull: 'Greece (GR)',
    workArea: 'No work area recorded',
    state: 'Candidate',
    contract: 'Registered',
    lastEvaluated: 'Never recorded',
    legalHold: 'No hold',
    chainsBarred: 'None',
    email: 'auditor-4928bcca1983@example.test',
    missingCount: 8,
    missingItems: [
      {
        group: 'NEEDED BEFORE THIS AUDITOR CAN BE PLANNED',
        items: [
          { title: 'Active in the register', desc: 'Now: Candidate.' },
          { title: 'Auditor Agreement, signed and valid', desc: 'Not on file.' },
          { title: 'Auditor Certificate, signed and valid', desc: 'Not on file.' },
          { title: 'Code of Conduct, signed and valid', desc: 'Not on file.' },
          { title: 'Competence for at least one category', desc: 'Nothing recorded: an assignment asks for a category he is qualified for.' },
          { title: 'VAT number', desc: 'Without it the self-billed invoice is not paid out, and he cannot be admitted to the register.' }
        ]
      },
      {
        group: 'NEEDED FOR PRICES AND PAYMENT',
        items: [
          { title: 'Prices', desc: '0 of 0 filled in. Without prices no audit can be paid.' },
          { title: 'Travel base', desc: 'Sets the travel estimate.' }
        ]
      }
    ],
    sourceNote: 'Came in from the list «GR auditors (Data, 28 Sept 2026)», delivered 28 Sep 2026.',
    competence: 'No competence has been recorded.',
    assignments: 'Not assigned to a dossier yet.',
    restrictions: { hold: 'Nothing on file', ties: 'Nothing on file', chains: 'Nothing on file' },
    prices: { linkSent: 'never', desc: 'No prices yet: he is not qualified for any category.', vat: 'None on file', vatSub: 'No VAT number has been recorded for this auditor here.' },
    counts: { prices: '0 of 0', competence: '0', documents: '0', history: '1' }
  },
  {
    name: 'Apostolos Chrysanthopoulos',
    country: 'GR',
    countryFull: 'Greece (GR)',
    workArea: 'No work area recorded',
    state: 'Candidate',
    contract: 'Registered',
    lastEvaluated: 'Never recorded',
    legalHold: 'No hold',
    chainsBarred: 'None',
    email: 'auditor-8833cb447712@example.test',
    missingCount: 8,
    missingItems: [
      {
        group: 'NEEDED BEFORE THIS AUDITOR CAN BE PLANNED',
        items: [
          { title: 'Active in the register', desc: 'Now: Candidate.' },
          { title: 'Auditor Agreement, signed and valid', desc: 'Not on file.' },
          { title: 'Auditor Certificate, signed and valid', desc: 'Not on file.' },
          { title: 'Code of Conduct, signed and valid', desc: 'Not on file.' },
          { title: 'Competence for at least one category', desc: 'Nothing recorded: an assignment asks for a category he is qualified for.' },
          { title: 'VAT number', desc: 'Without it the self-billed invoice is not paid out, and he cannot be admitted to the register.' }
        ]
      },
      {
        group: 'NEEDED FOR PRICES AND PAYMENT',
        items: [
          { title: 'Prices', desc: '0 of 0 filled in. Without prices no audit can be paid.' },
          { title: 'Travel base', desc: 'Sets the travel estimate.' }
        ]
      }
    ],
    sourceNote: 'Came in from the list «GR auditors (Data, 28 Sept 2026)», delivered 28 Sep 2026.',
    competence: 'No competence has been recorded.',
    assignments: 'Not assigned to a dossier yet.',
    restrictions: { hold: 'Nothing on file', ties: 'Nothing on file', chains: 'Nothing on file' },
    prices: { linkSent: 'never', desc: 'No prices yet: he is not qualified for any category.', vat: 'None on file', vatSub: 'No VAT number has been recorded for this auditor here.' },
    counts: { prices: '0 of 0', competence: '0', documents: '0', history: '1' }
  },
  {
    name: 'Argyris Galarniotis',
    country: 'GR',
    countryFull: 'Greece (GR)',
    workArea: 'No work area recorded',
    state: 'Candidate',
    contract: 'Registered',
    lastEvaluated: 'Never recorded',
    legalHold: 'No hold',
    chainsBarred: 'None',
    email: 'auditor-990011223344@example.test',
    missingCount: 8,
    missingItems: [
      {
        group: 'NEEDED BEFORE THIS AUDITOR CAN BE PLANNED',
        items: [
          { title: 'Active in the register', desc: 'Now: Candidate.' },
          { title: 'Auditor Agreement, signed and valid', desc: 'Not on file.' },
          { title: 'Auditor Certificate, signed and valid', desc: 'Not on file.' },
          { title: 'Code of Conduct, signed and valid', desc: 'Not on file.' },
          { title: 'Competence for at least one category', desc: 'Nothing recorded: an assignment asks for a category he is qualified for.' },
          { title: 'VAT number', desc: 'Without it the self-billed invoice is not paid out, and he cannot be admitted to the register.' }
        ]
      },
      {
        group: 'NEEDED FOR PRICES AND PAYMENT',
        items: [
          { title: 'Prices', desc: '0 of 0 filled in. Without prices no audit can be paid.' },
          { title: 'Travel base', desc: 'Sets the travel estimate.' }
        ]
      }
    ],
    sourceNote: 'Came in from the list «GR auditors (Data, 28 Sept 2026)», delivered 28 Sep 2026.',
    competence: 'No competence has been recorded.',
    assignments: 'Not assigned to a dossier yet.',
    restrictions: { hold: 'Nothing on file', ties: 'Nothing on file', chains: 'Nothing on file' },
    prices: { linkSent: 'never', desc: 'No prices yet: he is not qualified for any category.', vat: 'None on file', vatSub: 'No VAT number has been recorded for this auditor here.' },
    counts: { prices: '0 of 0', competence: '0', documents: '0', history: '1' }
  },
  {
    name: 'Arco Malcolm',
    country: 'AU',
    countryFull: 'Australia (AU)',
    workArea: 'Hotels and hostels (HH)',
    state: 'Active',
    contract: 'Registered',
    lastEvaluated: 'Never recorded',
    legalHold: 'No hold',
    chainsBarred: 'None',
    email: 'auditor-665544332211@example.test',
    missingCount: 0,
    missingItems: [],
    sourceNote: 'Registered auditor for Asia-Pacific and Oceania regional inspections.',
    competence: 'Accredited lead auditor for HH, RES, ATTR. 24 Green Key audits executed.',
    assignments: '3 dossiers completed; 1 dossier pending evaluation.',
    restrictions: { hold: 'No hold', ties: 'None on file', chains: 'None' },
    prices: { linkSent: '5 May 2025', desc: 'Negotiated overseas rate: €850 / inspection.', vat: 'ABN: 92 104 883 291', vatSub: 'Registered with Australian taxation office.' },
    counts: { prices: '1 of 1', competence: '3', documents: '3', history: '8' }
  }
];

const AUDITOR_MAP = {};
ALL_AUDITORS.forEach(a => {
  AUDITOR_MAP[a.name] = a;
});

// ─── Database of Relationships (From Parties screenshots) ───
const ALL_RELATIONSHIPS = [
  {
    name: 'ECOM (Montenegro)',
    establishments: 7,
    openDossiers: 0,
    kind: 'National Operator',
    country: 'Montenegro (ME)',
    contactPerson: 'Sasha Karajovic',
    lastContactDate: '4 Oct 2026',
    lastContactType: 'Delivery received',
    openActions: 0,
    nextAction: 'None',
    email: 'sasha@ecom.me',
    phone: '+382 67 123 456'
  },
  {
    name: 'KMVK (Netherlands)',
    establishments: 852,
    openDossiers: 1,
    kind: 'National Operator',
    country: 'Netherlands (NL)',
    contactPerson: 'Erik van Dijk',
    lastContactDate: '3 Oct 2026',
    lastContactType: 'Portal',
    openActions: 0,
    nextAction: 'None',
    email: 'coordinator@kmvk.nl',
    phone: '+31 30 234 5678'
  },
  {
    name: 'GK Turkey',
    establishments: 151,
    openDossiers: 0,
    kind: 'National Operator',
    country: 'Türkiye (TR)',
    contactPerson: 'Gülirem Şahin',
    lastContactDate: '2 Oct 2026',
    lastContactType: 'Delivery received',
    openActions: 0,
    nextAction: 'None',
    email: 'contact@turcev.org.tr',
    phone: '+90 212 555 1234'
  },
  {
    name: 'FEE México',
    establishments: 323,
    openDossiers: 0,
    kind: 'National Operator',
    country: 'Mexico (MX)',
    contactPerson: 'Joaquin Diaz Rios',
    lastContactDate: '2 Oct 2026',
    lastContactType: 'Delivery received',
    openActions: 0,
    nextAction: 'None',
    email: 'greenkey@feemexico.org',
    phone: '+52 55 5678 9012'
  },
  {
    name: 'Keep Scotland Beautiful',
    establishments: 55,
    openDossiers: 0,
    kind: 'National Operator',
    country: 'United Kingdom (GB)',
    contactPerson: 'Katie Murray',
    lastContactDate: '2 Oct 2026',
    lastContactType: 'Delivery received',
    openActions: 0,
    nextAction: 'None',
    email: 'katie.murray@keepscotlandbeautiful.org',
    phone: '+44 1786 471333'
  },
  {
    name: 'Wildlife and Environment Society of South Africa (WESSA)',
    establishments: 4,
    openDossiers: 0,
    kind: 'National Operator',
    country: 'South Africa (ZA)',
    contactPerson: 'Tevya Visser',
    lastContactDate: '2 Oct 2026',
    lastContactType: 'Delivery received',
    openActions: 0,
    nextAction: 'None',
    email: 'tevya.visser@wessa.co.za',
    phone: '+27 11 462 5663'
  },
  {
    name: 'Camping Het Lege Veld',
    establishments: 1,
    openDossiers: 0,
    kind: 'Establishment',
    country: 'Netherlands (NL)',
    contactPerson: 'No contacts recorded.',
    lastContactDate: '28 Sep 2026',
    lastContactType: 'Application',
    openActions: 0,
    nextAction: 'None',
    email: '—',
    phone: '—',
    typeSub: 'Establishment · Netherlands (NL)'
  }
];

const RELATIONSHIP_MAP = {};
ALL_RELATIONSHIPS.forEach(r => {
  RELATIONSHIP_MAP[r.name] = r;
});

let currentRelFilter = 'all';

// ─── Watch Datasets (From screenshots) ───

const DAILY_SUMMARIES = [
  { day: '7 Oct 2026', summary: 'Not watched here, on purpose: the rehearsal environment has no scheduler, on purpose (runbook section 1.8b)' },
  { day: '6 Oct 2026', summary: 'Not watched here, on purpose: the rehearsal environment has no scheduler, on purpose (runbook section 1.8b)' },
  { day: '5 Oct 2026', summary: 'Not watched here, on purpose: the rehearsal environment has no scheduler, on purpose (runbook section 1.8b)' },
  { day: '4 Oct 2026', summary: 'Not watched here, on purpose: the rehearsal environment has no scheduler, on purpose (runbook section 1.8b)' },
  { day: '3 Oct 2026', summary: 'Not watched here, on purpose: the rehearsal environment has no scheduler, on purpose (runbook section 1.8b)' },
  { day: '2 Oct 2026', summary: 'Not watched here, on purpose: the rehearsal environment has no scheduler, on purpose (runbook section 1.8b)' },
  { day: '1 Oct 2026', summary: 'Not watched here, on purpose: the rehearsal environment has no scheduler, on purpose (runbook section 1.8b)' },
  { day: '30 Sep 2026', summary: 'Not watched here, on purpose: the rehearsal environment has no scheduler, on purpose (runbook section 1.8b)' },
  { day: '29 Sep 2026', summary: 'Not watched here, on purpose: the rehearsal environment has no scheduler, on purpose (runbook section 1.8b)' },
  { day: '28 Sep 2026', summary: 'Not watched here, on purpose: the rehearsal environment has no scheduler, on purpose (runbook section 1.8b)' },
  { day: '27 Sep 2026', summary: 'Not watched here, on purpose: the rehearsal environment has no scheduler, on purpose (runbook section 1.8b)' },
  { day: '26 Sep 2026', summary: 'Not watched here, on purpose: the rehearsal environment has no scheduler, on purpose (runbook section 1.8b)' },
  { day: '25 Sep 2026', summary: 'Not watched here, on purpose: the rehearsal environment has no scheduler, on purpose (runbook section 1.8b)' },
  { day: '24 Sep 2026', summary: 'Not watched here, on purpose: the rehearsal environment has no scheduler, on purpose (runbook section 1.8b)' }
];

const RAW_FIRST_DEADLINES = [
  {
    id: 1,
    subject: 'Establishment',
    number: 16,
    establishment: 'GK90016 — Attractie De Draaimolen',
    establishmentRef: 'GK90016',
    dossierId: 'A-2025-00016',
    deadline: 'Establishment fee payable in advance',
    status: 'Fulfilled',
    due: '30 Jan 2025',
    countedFrom: 'the certification agreement takes effect, on 2025-01-30',
    observed: '12 Oct 2026 07:03'
  },
  {
    id: 2,
    subject: 'Dossier',
    number: 16,
    establishment: 'GK90016 — Attractie De Draaimolen',
    establishmentRef: 'GK90016',
    dossierId: 'A-2025-00016',
    deadline: 'Establishment accepts or refuses the audit assignment',
    status: 'Fulfilled',
    due: '3 Mar 2025',
    countedFrom: 'the auditor was proposed to the establishment, on 2025-02-21',
    observed: '12 Oct 2026 07:03'
  },
  {
    id: 3,
    subject: 'Establishment',
    number: 16,
    establishment: 'GK90016 — Attractie De Draaimolen',
    establishmentRef: 'GK90016',
    dossierId: 'A-2025-00016',
    deadline: 'Certification body remits the licence fee to the scheme owner',
    status: 'Overdue',
    due: '16 Mar 2025',
    countedFrom: 'the establishment fee was received, on 16 Feb 2025',
    observed: '12 Oct 2026 07:03'
  },
  {
    id: 4,
    subject: 'Dossier',
    number: 16,
    establishment: 'GK90016 — Attractie De Draaimolen',
    establishmentRef: 'GK90016',
    dossierId: 'A-2025-00016',
    deadline: 'Audit fee paid in full',
    status: 'Fulfilled',
    due: '10 Apr 2025',
    countedFrom: 'the audit is planned, on 10 May 2025',
    observed: '12 Oct 2026 07:03'
  },
  {
    id: 5,
    subject: 'Establishment',
    number: 14,
    establishment: 'GK90014 — Vakantiepark Schetsmatig',
    establishmentRef: 'GK90014',
    dossierId: 'A-2025-00014',
    deadline: 'Establishment fee payable in advance',
    status: 'Fulfilled',
    due: '10 May 2025',
    countedFrom: 'the certification agreement takes effect, on 2025-05-10',
    observed: '12 Oct 2026 07:03'
  },
  {
    id: 6,
    subject: 'Dossier',
    number: 16,
    establishment: 'GK90016 — Attractie De Draaimolen',
    establishmentRef: 'GK90016',
    dossierId: 'A-2025-00016',
    deadline: 'Audit report delivered to the certification body (the draft, where there is one)',
    status: 'Fulfilled',
    due: '23 May 2025',
    countedFrom: 'the on-site audit was carried out, on 10 May 2025',
    observed: '12 Oct 2026 07:03'
  },
  {
    id: 7,
    subject: 'Dossier',
    number: 14,
    establishment: 'GK90014 — Vakantiepark Schetsmatig',
    establishmentRef: 'GK90014',
    dossierId: 'A-2025-00014',
    deadline: 'Establishment accepts or refuses the audit assignment',
    status: 'Fulfilled',
    due: '12 Jun 2025',
    countedFrom: 'the auditor was proposed to the establishment, on 2025-06-02',
    observed: '12 Oct 2026 07:03'
  },
  {
    id: 8,
    subject: 'Establishment',
    number: 14,
    establishment: 'GK90014 — Vakantiepark Schetsmatig',
    establishmentRef: 'GK90014',
    dossierId: 'A-2025-00014',
    deadline: 'Certification body remits the licence fee to the scheme owner',
    status: 'Overdue',
    due: '24 Jun 2025',
    countedFrom: 'the establishment fee was received, on 24 May 2025',
    observed: '12 Oct 2026 07:03'
  },
  {
    id: 9,
    subject: 'Establishment',
    number: 18,
    establishment: 'GK90018 — Restaurant De Voetnoot',
    establishmentRef: 'GK90018',
    dossierId: 'A-2025-00018',
    deadline: 'Establishment fee payable in advance',
    status: 'Fulfilled',
    due: '29 Jun 2025',
    countedFrom: 'the certification agreement takes effect, on 2025-06-29',
    observed: '12 Oct 2026 07:03'
  },
  {
    id: 10,
    subject: 'Dossier',
    number: 16,
    establishment: 'GK90016 — Attractie De Draaimolen',
    establishmentRef: 'GK90016',
    dossierId: 'A-2025-00016',
    deadline: 'Certification body review and decision',
    status: 'Fulfilled',
    due: '30 Jun 2025',
    countedFrom: 'the dossier reached the certification body, on 2025-05-31',
    observed: '12 Oct 2026 07:03'
  }
];

function generateAllDeadlines() {
  const list = [...RAW_FIRST_DEADLINES];
  const establishmentsPool = [
    { num: 16, ref: 'GK90016', name: 'GK90016 — Attractie De Draaimolen' },
    { num: 14, ref: 'GK90014', name: 'GK90014 — Vakantiepark Schetsmatig' },
    { num: 18, ref: 'GK90018', name: 'GK90018 — Restaurant De Voetnoot' },
    { num: 1, ref: 'GK90001', name: 'GK90001 — Hotel Het Veerhuis' },
    { num: 8, ref: 'GK90008', name: 'GK90008 — Camping Duinenzicht' },
    { num: 22, ref: 'GK90022', name: 'GK90022 — Bungalowpark De Sparren' },
    { num: 33, ref: 'GK90033', name: 'GK90033 — Grand Café De Haven' },
    { num: 5, ref: 'GK90005', name: 'GK90005 — Conferentiecentrum Bosrijk' },
    { num: 12, ref: 'GK90012', name: 'GK90012 — Strandhotel Zeelust' },
    { num: 25, ref: 'GK90025', name: 'GK90025 — B&B Het Groene Woud' }
  ];
  const deadlineTemplates = [
    { subject: 'Establishment', text: 'Establishment fee payable in advance', trigger: 'the certification agreement takes effect' },
    { subject: 'Dossier', text: 'Establishment accepts or refuses the audit assignment', trigger: 'the auditor was proposed to the establishment' },
    { subject: 'Establishment', text: 'Certification body remits the licence fee to the scheme owner', trigger: 'the establishment fee was received' },
    { subject: 'Dossier', text: 'Audit fee paid in full', trigger: 'the audit is planned' },
    { subject: 'Dossier', text: 'Audit report delivered to the certification body (the draft, where there is one)', trigger: 'the on-site audit was carried out' },
    { subject: 'Dossier', text: 'Certification body review and decision', trigger: 'the dossier reached the certification body' },
    { subject: 'Dossier', text: 'Certification body informs the scheme owner', trigger: 'the certification decision was taken' },
    { subject: 'Dossier', text: 'Rectification of non-conformities by establishment', trigger: 'the draft audit report was issued' },
    { subject: 'Establishment', text: 'Surveillance figures and action plan delivered', trigger: 'the surveillance window opened' },
    { subject: 'Dossier', text: 'Auditor signs impartiality and competence declaration', trigger: 'the audit date was scheduled' }
  ];
  const months = ['Jul 2025', 'Aug 2025', 'Sep 2025', 'Oct 2025', 'Nov 2025', 'Dec 2025', 'Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026'];

  for (let i = 11; i <= 287; i++) {
    const est = establishmentsPool[(i - 11) % establishmentsPool.length];
    const tpl = deadlineTemplates[(i * 3) % deadlineTemplates.length];
    const isOverdue = (i % 5 === 0 || i % 7 === 0);
    const m = months[Math.floor(((i - 11) / 287) * months.length)];
    const day = ((i * 7) % 28) + 1;
    list.push({
      id: i,
      subject: tpl.subject,
      number: est.num,
      establishment: est.name,
      establishmentRef: est.ref,
      dossierId: `A-2025-${String(est.num).padStart(5, '0')}`,
      deadline: tpl.text,
      status: isOverdue ? 'Overdue' : 'Fulfilled',
      due: `${day} ${m}`,
      countedFrom: `${tpl.trigger}, on 2025-${String((i % 12) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      observed: '12 Oct 2026 07:03'
    });
  }
  return list;
}

const ALL_DEADLINES = generateAllDeadlines();

const ALL_IMPORT_RUNS = [
  {
    started: '22 Aug 2026 14:05',
    source: 'Answers of the establishment to the criteria (stream 2)',
    status: 'Completed',
    read: 4,
    created: 0,
    changed: 3,
    refused: 1,
    notRead: ['auditor_judgement', 'certification_body_judgement']
  },
  {
    started: '14 Jan 2026 18:55',
    source: 'Answers of the establishment to the criteria (stream 2)',
    status: 'Completed',
    read: 4,
    created: 0,
    changed: 3,
    refused: 1,
    notRead: ['auditor_judgement', 'certification_body_judgement']
  },
  {
    started: '10 Aug 2026 14:18',
    source: 'Surveillance answers delivered through the portal by a National Operator (stream 3)',
    status: 'Completed',
    read: 7,
    created: 7,
    changed: 0,
    refused: 0,
    notRead: ['auditor_judgement', 'certification_body_judgement']
  },
  {
    started: '22 Sep 2026 09:31',
    source: 'Delivered through the portal by a National Operator',
    status: 'Completed',
    read: 1,
    created: 0,
    changed: 1,
    refused: 0,
    notReadText: 'every mapped column'
  },
  {
    started: '24 Sep 2026 12:59',
    source: 'Planning export of 15 September 2026',
    status: 'Completed',
    read: 9406,
    created: 9388,
    changed: 0,
    refused: 18,
    notReadText: 'every mapped column'
  },
  {
    started: '24 Sep 2026 13:04',
    source: 'FEE export of 8 September 2026 10#30.xlsx, tab stream key (HH)(c)',
    status: 'Completed',
    read: 9580,
    created: 296,
    changed: 9273,
    refused: 11,
    notReadText: 'every mapped column'
  },
  {
    started: '30 Sep 2026 00:42',
    source: 'National Operator Norway, list of 29 September 2026 (our form, tab «Establishments»)',
    status: 'Completed',
    read: 70,
    created: 28,
    changed: 42,
    refused: 4,
    notReadText: 'every mapped column'
  },
  {
    started: '30 Sep 2026 14:26',
    source: 'National Operator Egypt, list of 23 September 2026 (our form, tab «Establishments»)',
    status: 'Completed',
    read: 38,
    created: 3,
    changed: 35,
    refused: 2,
    notReadText: 'every mapped column'
  },
  {
    started: '30 Sep 2026 14:28',
    source: 'National Operator Poland, list of 23 September 2026 (our form, tab «Establishments»)',
    status: 'Completed',
    read: 128,
    created: 10,
    changed: 115,
    refused: 1,
    notReadText: 'every mapped column'
  },
  {
    started: '30 Sep 2026 14:28',
    source: 'National Operator Jordan, list of 23 September 2026 (our form, tab «Establishments»)',
    status: 'Completed',
    read: 46,
    created: 4,
    changed: 40,
    refused: 2,
    notReadText: 'every mapped column'
  }
];

// ─── Primary View Switching ───

function hideAllViews() {
  const views = [
    'worklist-view',
    'dossiers-list-view',
    'establishments-list-view',
    'establishment-detail-view',
    'planned-assessments-list-view',
    'planned-assessment-detail-view',
    'complaints-list-view',
    'auditors-list-view',
    'auditor-detail-view',
    'relationship-mgmt-view',
    'relationship-detail-view',
    'parties-mail-texts-view',
    'watch-daily-summary-view',
    'watch-office-overview-view',
    'watch-deadlines-view',
    'watch-import-runs-view',
    'watch-messages-view',
    'watch-bounces-view',
    'watch-payments-view',
    'watch-sentback-view',
    'dossier-view',
    'settings-users-roles-view',
    'settings-price-list-view',
    'settings-health-safety-view',
    'settings-working-days-view',
    'settings-assumptions-view',
    'settings-themes-view',
    'settings-price-rules-view',
    'settings-tax-rates-view',
    'settings-form-languages-view',
    'settings-general-view',
    'waiting-management-view',
    'national-operators-view',
    'parties-requests-view',
    'parties-outreach-view',
    'sending-stop-view',
    'auditor-registration-public-view'
  ];
  views.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

function ensureWorkNavActive() {
  const navWork = document.getElementById('nav-work');
  const navParties = document.getElementById('nav-parties');
  const navWatch = document.getElementById('nav-watch');
  const navSettings = document.getElementById('nav-settings');
  if (navWork) navWork.classList.add('active');
  if (navParties) navParties.classList.remove('active');
  if (navWatch) navWatch.classList.remove('active');
  if (navSettings) navSettings.classList.remove('active');

  const subnavWork = document.getElementById('subnav-work');
  const subnavParties = document.getElementById('subnav-parties');
  const subnavWatch = document.getElementById('subnav-watch');
  const subnavSettings = document.getElementById('subnav-settings');
  if (subnavWork) subnavWork.classList.remove('hidden');
  if (subnavParties) subnavParties.classList.add('hidden');
  if (subnavWatch) subnavWatch.classList.add('hidden');
  if (subnavSettings) subnavSettings.classList.add('hidden');
}

function ensurePartiesNavActive() {
  const navWork = document.getElementById('nav-work');
  const navParties = document.getElementById('nav-parties');
  const navWatch = document.getElementById('nav-watch');
  const navSettings = document.getElementById('nav-settings');
  if (navParties) navParties.classList.add('active');
  if (navWork) navWork.classList.remove('active');
  if (navWatch) navWatch.classList.remove('active');
  if (navSettings) navSettings.classList.remove('active');

  const subnavWork = document.getElementById('subnav-work');
  const subnavParties = document.getElementById('subnav-parties');
  const subnavWatch = document.getElementById('subnav-watch');
  const subnavSettings = document.getElementById('subnav-settings');
  if (subnavWork) subnavWork.classList.add('hidden');
  if (subnavParties) subnavParties.classList.remove('hidden');
  if (subnavWatch) subnavWatch.classList.add('hidden');
  if (subnavSettings) subnavSettings.classList.add('hidden');
}

function ensureWatchNavActive() {
  const navWork = document.getElementById('nav-work');
  const navParties = document.getElementById('nav-parties');
  const navWatch = document.getElementById('nav-watch');
  const navSettings = document.getElementById('nav-settings');
  if (navWatch) navWatch.classList.add('active');
  if (navWork) navWork.classList.remove('active');
  if (navParties) navParties.classList.remove('active');
  if (navSettings) navSettings.classList.remove('active');

  const subnavWork = document.getElementById('subnav-work');
  const subnavParties = document.getElementById('subnav-parties');
  const subnavWatch = document.getElementById('subnav-watch');
  const subnavSettings = document.getElementById('subnav-settings');
  if (subnavWork) subnavWork.classList.add('hidden');
  if (subnavParties) subnavParties.classList.add('hidden');
  if (subnavWatch) subnavWatch.classList.remove('hidden');
  if (subnavSettings) subnavSettings.classList.add('hidden');
}

function updateSubNav(activeTab) {
  ensureWorkNavActive();
  const links = {
    worklist: document.getElementById('sub-worklist'),
    dossiers: document.getElementById('sub-dossiers'),
    establishments: document.getElementById('sub-establishments'),
    planned: document.getElementById('sub-planned'),
    complaints: document.getElementById('sub-complaints')
  };

  Object.values(links).forEach(link => {
    if (link) link.classList.remove('active');
  });

  if (links[activeTab]) {
    links[activeTab].classList.add('active');
  }
}

// ─── Parties & Auditors Routing Functions ───

function showWorkView() {
  ensureWorkNavActive();
  showWorklist();
}

function showPartiesNav() {
  ensurePartiesNavActive();
  showAuditorsList();
}

function updatePartiesSubNav(activeId) {
  const ids = [
    'sub-auditors',
    'sub-national-operators',
    'sub-relationship-mgmt',
    'sub-parties-requests',
    'sub-parties-outreach',
    'sub-parties-mail-texts'
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === activeId) el.classList.add('active');
      else el.classList.remove('active');
    }
  });
}

function showAuditorsList() {
  ensurePartiesNavActive();
  hideAllViews();
  const el = document.getElementById('auditors-list-view');
  if (el) el.classList.remove('hidden');

  updatePartiesSubNav('sub-auditors');
  document.title = 'Audit Independer — Auditors';
  renderAuditorsTable();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showNationalOperators() {
  ensurePartiesNavActive();
  hideAllViews();
  const el = document.getElementById('national-operators-view');
  if (el) el.classList.remove('hidden');

  updatePartiesSubNav('sub-national-operators');
  document.title = 'Audit Independer — National Operators';
  renderNationalOperatorsTable();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showRelationshipMgmt() {
  ensurePartiesNavActive();
  hideAllViews();
  const el = document.getElementById('relationship-mgmt-view');
  if (el) el.classList.remove('hidden');

  updatePartiesSubNav('sub-relationship-mgmt');
  document.title = 'Audit Independer — Relationship management';
  renderRelationshipTable();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showPartiesRequests() {
  ensurePartiesNavActive();
  hideAllViews();
  const el = document.getElementById('parties-requests-view');
  if (el) el.classList.remove('hidden');

  updatePartiesSubNav('sub-parties-requests');
  document.title = 'Audit Independer — Requests';
  renderPartiesRequestsTable();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showPartiesOutreach() {
  ensurePartiesNavActive();
  hideAllViews();
  const el = document.getElementById('parties-outreach-view');
  if (el) el.classList.remove('hidden');

  updatePartiesSubNav('sub-parties-outreach');
  document.title = 'Audit Independer — Outreach';
  renderOutreachCampaignsTable();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ═══════════════════════════════════════════════════════════════════════
// MAIL TEXTS DATA & FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

const MAIL_TEXTS_DATA = {
  establishments: {
    en: {
      langKey: 'en',
      language: 'English',
      subject: 'Your Green Key certification: please check your details by {{answer_by}}',
      body: `Dear {{contact_name}}, Since 1 October 2026, Green Key certification works with an independent certification body between Green Key and the auditor. Audit Independer is an independent certification body for Green Key, and we would like to take care of the next step of the certification of {{establishment_name}}. Your current certificate stays valid until its expiry date. Nothing changes today. What we ask you Please open your personal link, check the details we have for {{establishment_name}}, and let us know whether you would like us to take care of your next audit or surveillance. It takes about five minutes. {{link}} Please answer by {{answer_by}}. Saying yes is not a contract: we only send an agreement to sign when your audit or surveillance is planned. Not interested? Open your link and tell us; we will then not write to you again. If you have a question, simply reply to this e-mail. Kind regards, Michael van der Klugt Audit Independer`,
      version: 1,
      confirmed: true,
      confirmedText: 'Version 1, confirmed by Officer on 4 Oct 2026',
      expanded: false
    },
    fr: {
      langKey: 'fr',
      language: 'Français',
      subject: 'Votre certification Green Key : merci de vérifier vos informations avant le {{answer_by}}',
      body: `Bonjour {{contact_name}}, Depuis le 1er octobre 2026, la certification Green Key fait intervenir un organisme de certification indépendant entre Green Key et l’auditeur. Audit Independer est un organisme de certification indépendant pour Green Key, et nous souhaitons prendre en charge la prochaine étape de la certification de {{establishment_name}}. Votre certificat actuel reste valable jusqu’à sa date d’expiration. Rien ne change aujourd’hui. Ce que nous vous demandons Merci d’ouvrir votre lien personnel, de vérifier les informations dont nous disposons pour {{establishment_name}} et de nous indiquer si vous souhaitez que nous prenions en charge votre prochain audit ou votre prochaine visite de surveillance. Cela prend environ cinq minutes. {{link}} Merci de répondre avant le {{answer_by}}. Répondre oui ne vous engage pas : nous ne vous envoyons un contrat à signer qu’au moment où votre audit ou votre visite de surveillance est planifié. Pas intéressé ? Ouvrez votre lien et indiquez-le-nous ; nous ne vous écrirons plus. Pour toute question, il vous suffit de répondre à ce message. Cordialement, Michael van der Klugt Audit Independer`,
      version: 1,
      confirmed: false,
      confirmedText: 'Version 1, a draft',
      expanded: false
    },
    es: {
      langKey: 'es',
      language: 'Español',
      subject: 'Su certificación Green Key: compruebe sus datos antes del {{answer_by}}',
      body: `Estimado/a {{contact_name}}: Desde el 1 de octubre de 2026, la certificación Green Key cuenta con un organismo de certificación independiente entre Green Key y el auditor. Audit Independer es un organismo de certificación independiente para Green Key, y nos gustaría encargarnos del siguiente paso de la certificación de {{establishment_name}}. Su certificado actual sigue siendo válido hasta su fecha de vencimiento. Hoy no cambia nada. Lo que le pedimos Abra su enlace personal, compruebe los datos que tenemos de {{establishment_name}} e indíquenos si desea que nos encarguemos de su próxima auditoría o visita de seguimiento. Le llevará unos cinco minutos. {{link}} Le rogamos que responda antes del {{answer_by}}. Responder que sí no supone ningún contrato: solo le enviaremos un acuerdo para firmar cuando se planifique su auditoría o visita de seguimiento. ¿No le interesa? Abra su enlace e indíquenoslo; no volveremos a escribirle. Si tiene alguna pregunta, responda simplemente a este correo. Atentamente, Michael van der Klugt Audit Independer`,
      version: 1,
      confirmed: false,
      confirmedText: 'Version 1, a draft',
      expanded: false
    },
    pt: {
      langKey: 'pt',
      language: 'Português',
      subject: 'A sua certificação Green Key: confirme os seus dados até {{answer_by}}',
      body: `Caro(a) {{contact_name}}, Desde 1 de outubro de 2026, a certificação Green Key conta com um organismo de certificação independente entre a Green Key e o auditor. A Audit Independer é um organismo de certificação independente para a Green Key, e gostaríamos de tratar da próxima etapa da certificação de {{establishment_name}}. O seu certificado atual continua válido até à data de validade. Hoje não muda nada. O que lhe pedimos Abra a sua ligação pessoal, verifique os dados que temos de {{establishment_name}} e diga-nos se pretende que tratemos da sua próxima auditoria ou visita de acompanhamento. Demora cerca de cinco minutos. {{link}} Responda até {{answer_by}}, por favor. Responder que sim não é um contrato: só enviamos um acordo para assinar quando a sua auditoria ou visita de acompanhamento for agendada. Não tem interesse? Abra a sua ligação e diga-nos; não voltaremos a escrever-lhe. Se tiver alguma dúvida, basta responder a este e-mail. Com os melhores cumprimentos, Michael van der Klugt Audit Independer`,
      version: 1,
      confirmed: false,
      confirmedText: 'Version 1, a draft',
      expanded: false
    },
    de: {
      langKey: 'de',
      language: 'Deutsch',
      subject: 'Ihre Green-Key-Zertifizierung: Bitte prüfen Sie Ihre Angaben bis zum {{answer_by}}',
      body: `Guten Tag {{contact_name}}, seit dem 1. Oktober 2026 arbeitet die Green-Key-Zertifizierung mit einer unabhängigen Zertifizierungsstelle zwischen Green Key und dem Auditor. Audit Independer ist eine unabhängige Zertifizierungsstelle für Green Key, und wir würden gern den nächsten Schritt der Zertifizierung von {{establishment_name}} für Sie übernehmen. Ihr aktuelles Zertifikat bleibt bis zu seinem Ablaufdatum gültig. Heute ändert sich nichts. Worum wir Sie bitten Bitte öffnen Sie Ihren persönlichen Link, prüfen Sie die Angaben, die wir zu {{establishment_name}} haben, und teilen Sie uns mit, ob wir Ihr nächstes Audit oder Ihren nächsten Überwachungsbesuch übernehmen sollen. Das dauert etwa fünf Minuten. {{link}} Bitte antworten Sie bis zum {{answer_by}}. Ein Ja ist kein Vertrag: Eine Vereinbarung zur Unterschrift senden wir Ihnen erst, wenn Ihr Audit oder Überwachungsbesuch geplant wird. Kein Interesse? Öffnen Sie Ihren Link und teilen Sie es uns mit; dann schreiben wir Ihnen nicht mehr. Bei Fragen antworten Sie einfach auf diese E-Mail. Mit freundlichen Grüßen Michael van der Klugt Audit Independer`,
      version: 1,
      confirmed: false,
      confirmedText: 'Version 1, a draft',
      expanded: false
    }
  },
  auditors: {
    en: {
      langKey: 'en',
      language: 'English',
      subject: 'Green Key audits with Audit Independer: please answer by {{answer_by}}',
      body: `Dear {{auditor_name}}, Since 1 October 2026, Green Key certification works with an independent certification body between Green Key and the auditor. Audit Independer is an independent certification body for Green Key, and we would like to work with you on Green Key audits. The agreements you signed under Green Key applied until 30 September 2026. To carry out audits through us, you register with Audit Independer. Your Green Key experience counts when we register you. What we ask you Please open your personal link, check the details we have for you, and let us know whether you would like to work with us. {{link}} Please answer by {{answer_by}}. Saying yes is not a contract yet. When we have an audit for you, we send you the Auditor Agreement and the Code of Conduct to sign, and for each audit you see the establishment, the date and your fee before you accept it. Not interested? Open your link and tell us; we will then not write to you again. If you have a question, simply reply to this e-mail. Kind regards, Michael van der Klugt Audit Independer`,
      version: 1,
      confirmed: true,
      confirmedText: 'Version 1, confirmed by Officer on 4 Oct 2026',
      expanded: false
    },
    fr: {
      langKey: 'fr',
      language: 'Français',
      subject: 'Réaliser des audits Green Key avec Audit Independer : merci de répondre avant le {{answer_by}}',
      body: `Bonjour {{auditor_name}}, Depuis le 1er octobre 2026, la certification Green Key fait intervenir un organisme de certification indépendant entre Green Key et l’auditeur. Audit Independer est un organisme de certification indépendant pour Green Key, et nous souhaitons travailler avec vous sur des audits Green Key. Les accords que vous avez signés dans le cadre de Green Key étaient valables jusqu’au 30 septembre 2026. Pour réaliser des audits avec nous, vous vous enregistrez auprès d’Audit Independer. Votre expérience Green Key est prise en compte lors de votre enregistrement. Ce que nous vous demandons Merci d’ouvrir votre lien personnel, de vérifier les informations dont nous disposons à votre sujet et de nous indiquer si vous souhaitez travailler avec nous. {{link}} Merci de répondre avant le {{answer_by}}. Répondre oui ne vous engage pas encore. Lorsque nous avons un audit pour vous, nous vous envoyons l’Auditor Agreement et le Code of Conduct à signer, et pour chaque audit vous voyez l’établissement, la date et votre rémunération avant de l’accepter. Pas intéressé ? Ouvrez votre lien et indiquez-le-nous ; nous ne vous écrirons plus. Pour toute question, il vous suffit de répondre à ce message. Cordialement, Michael van der Klugt Audit Independer`,
      version: 1,
      confirmed: false,
      confirmedText: 'Version 1, a draft',
      expanded: false
    },
    es: {
      langKey: 'es',
      language: 'Español',
      subject: 'Auditorías Green Key con Audit Independer: responda antes del {{answer_by}}',
      body: `Estimado/a {{auditor_name}}: Desde el 1 de octubre de 2026, la certificación Green Key cuenta con un organismo de certificación independiente entre Green Key y el auditor. Audit Independer es un organismo de certificación independiente para Green Key, y nos gustaría trabajar con usted en auditorías Green Key. Los acuerdos que firmó en el marco de Green Key fueron válidos hasta el 30 de septiembre de 2026. Para realizar auditorías con nosotros, debe registrarse en Audit Independer. Su experiencia en Green Key se tendrá en cuenta en su registro. Lo que le pedimos Abra su enlace personal, compruebe los datos que tenemos sobre usted e indíquenos si desea trabajar con nosotros. {{link}} Le rogamos que responda antes del {{answer_by}}. Responder que sí todavía no supone ningún contrato. Cuando tengamos una auditoría para usted, le enviaremos el Auditor Agreement y el Code of Conduct para firmar, y en cada auditoría verá el establecimiento, la fecha y sus honorarios antes de aceptarla. ¿No le interesa? Abra su enlace e indíquenoslo; no volveremos a escribirle. Si tiene alguna pregunta, responda simplemente a este correo. Atentamente, Michael van der Klugt Audit Independer`,
      version: 1,
      confirmed: false,
      confirmedText: 'Version 1, a draft',
      expanded: false
    },
    pt: {
      langKey: 'pt',
      language: 'Português',
      subject: 'Auditorias Green Key com a Audit Independer: responda até {{answer_by}}',
      body: `Caro(a) {{auditor_name}}, Desde 1 de outubro de 2026, a certificação Green Key conta com um organismo de certificação independente entre a Green Key e o auditor. A Audit Independer é um organismo de certificação independente para a Green Key, e gostaríamos de trabalhar consigo em auditorias Green Key. Os acordos que assinou no âmbito da Green Key foram válidos até 30 de setembro de 2026. Para realizar auditorias connosco, deve registar-se na Audit Independer. A sua experiência na Green Key será tida em conta no seu registo. O que lhe pedimos Abra a sua ligação pessoal, verifique os dados que temos sobre si e diga-nos se pretende trabalhar connosco. {{link}} Responda até {{answer_by}}, por favor. Responder que sim ainda não é um contrato. Quando tivermos uma auditoria para si, enviamos-lhe o Auditor Agreement e o Code of Conduct para assinar e, em cada auditoria, vê o estabelecimento, a data e os seus honorários antes de a aceitar. Não tem interesse? Abra a sua ligação e diga-nos; não voltaremos a escrever-lhe. Se tiver alguma dúvida, basta responder a este e-mail. Com os melhores cumprimentos, Michael van der Klugt Audit Independer`,
      version: 1,
      confirmed: false,
      confirmedText: 'Version 1, a draft',
      expanded: false
    },
    de: {
      langKey: 'de',
      language: 'Deutsch',
      subject: 'Green-Key-Audits mit Audit Independer: Bitte antworten Sie bis zum {{answer_by}}',
      body: `Guten Tag {{auditor_name}}, seit dem 1. Oktober 2026 arbeitet die Green-Key-Zertifizierung mit einer unabhängigen Zertifizierungsstelle zwischen Green Key und dem Auditor. Audit Independer ist eine unabhängige Zertifizierungsstelle für Green Key, und wir würden gern bei Green-Key-Audits mit Ihnen zusammenarbeiten. Die Vereinbarungen, die Sie im Rahmen von Green Key unterzeichnet haben, galten bis zum 30. September 2026. Um Audits über uns durchzuführen, registrieren Sie sich bei Audit Independer. Ihre Erfahrung mit Green Key wird bei Ihrer Registrierung berücksichtigt. Worum wir Sie bitten Bitte öffnen Sie Ihren persönlichen Link, prüfen Sie die Angaben, die wir zu Ihnen haben, und teilen Sie uns mit, ob Sie mit uns zusammenarbeiten möchten. {{link}} Bitte antworten Sie bis zum {{answer_by}}. Ein Ja ist noch kein Vertrag. Wenn wir ein Audit für Sie haben, senden wir Ihnen das Auditor Agreement und den Code of Conduct zur Unterschrift, und bei jedem Audit sehen Sie den Betrieb, das Datum und Ihr Honorar, bevor Sie es annehmen. Kein Interesse? Öffnen Sie Ihren Link und teilen Sie es uns mit; dann schreiben wir Ihnen nicht mehr. Bei Fragen antworten Sie einfach auf diese E-Mail. Mit freundlichen Grüßen Michael van der Klugt Audit Independer`,
      version: 1,
      confirmed: false,
      confirmedText: 'Version 1, a draft',
      expanded: false
    }
  }
};

function formatMailTextVariables(text) {
  if (!text) return '';
  return text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, '<span class="mt-variable-tag">{{$1}}</span>');
}

function renderMailTextsSection(sectionKey, tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  const data = MAIL_TEXTS_DATA[sectionKey];
  if (!data) return;

  const keys = ['en', 'fr', 'es', 'pt', 'de'];
  tbody.innerHTML = keys.map(k => {
    const item = data[k];
    const standingHtml = item.confirmed
      ? `<span class="mt-standing-confirmed">${item.confirmedText}</span>`
      : `<span class="mt-standing-draft">${item.confirmedText}</span>`;

    const confirmBtn = !item.confirmed
      ? `<button class="btn-confirm-text" onclick="confirmMailText('${sectionKey}', '${k}')">Confirm this text</button>`
      : '';

    const writeBtn = `<button class="btn-write-version" onclick="openWriteNewVersionModal('${sectionKey}', '${k}')">Write a new version</button>`;

    const toggleIcon = item.expanded ? '▼' : '▶';
    const bodyPreview = item.expanded
      ? `<div class="mt-body-text">${formatMailTextVariables(item.body)}</div>`
      : `<div class="mt-body-text" style="color:var(--text-muted);">${formatMailTextVariables(item.body.slice(0, 120))}...</div>`;

    return `
      <tr>
        <td>
          <div class="mt-lang-name">${item.language}</div>
        </td>
        <td>
          <div class="mt-subject-line" onclick="toggleMailTextPreview('${sectionKey}', '${k}')" title="Klik om volledige tekst te tonen / in te klappen">
            <span class="mt-toggle-icon">${toggleIcon}</span>
            <div>
              <strong>${formatMailTextVariables(item.subject)}</strong>
            </div>
          </div>
          ${bodyPreview}
        </td>
        <td>
          ${standingHtml}
        </td>
        <td style="text-align: right; white-space: nowrap;">
          ${confirmBtn}
          ${writeBtn}
        </td>
      </tr>
    `;
  }).join('');
}

function renderMailTextsTables() {
  renderMailTextsSection('establishments', 'mail-texts-establishments-tbody');
  renderMailTextsSection('auditors', 'mail-texts-auditors-tbody');
}

function toggleMailTextPreview(sectionKey, langKey) {
  const item = MAIL_TEXTS_DATA[sectionKey]?.[langKey];
  if (item) {
    item.expanded = !item.expanded;
    renderMailTextsTables();
  }
}

function confirmMailText(sectionKey, langKey) {
  const item = MAIL_TEXTS_DATA[sectionKey]?.[langKey];
  if (!item) return;

  item.confirmed = true;
  item.confirmedText = `Version ${item.version}, confirmed by Officer on 12 Oct 2026`;
  renderMailTextsTables();
  showToast('Tekst bevestigd', `De e-mailtekst voor ${item.language} (${sectionKey === 'establishments' ? 'Establishments' : 'Auditors'}) is bevestigd en gereed voor verzending.`, 'success');
}

function openWriteNewVersionModal(sectionKey, langKey) {
  const item = MAIL_TEXTS_DATA[sectionKey]?.[langKey];
  if (!item) return;

  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!modal || !content) return;

  const sectionTitle = sectionKey === 'establishments' ? 'The mail to establishments' : 'The mail to auditors';

  content.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">
        <span class="material-symbols-outlined" style="color:#d4a5d8;">edit_note</span>
        Write a new version: ${sectionTitle} (${item.language})
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="modal-body" style="display:flex; flex-direction:column; gap:16px;">
      <div style="font-size:12.5px; color:var(--text-muted); line-height:1.5;">
        Writing a new version will create <strong>Version ${item.version + 1} (Draft)</strong>. Variables such as <code style="color:#f6ad55;">{{answer_by}}</code>, <code style="color:#f6ad55;">{{contact_name}}</code>, <code style="color:#f6ad55;">{{establishment_name}}</code>, and <code style="color:#f6ad55;">{{link}}</code> are filled in per recipient.
      </div>
      <div>
        <label style="display:block; font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">
          Subject
        </label>
        <input type="text" id="modal-mail-subject" class="steel-input" style="width:100%; height:38px; font-size:13px;" value="${item.subject.replace(/"/g, '&quot;')}" />
      </div>
      <div>
        <label style="display:block; font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">
          Body text
        </label>
        <textarea id="modal-mail-body" class="steel-input" style="width:100%; height:180px; font-size:13px; line-height:1.5; font-family:inherit; resize:vertical; padding:10px;">${item.body}</textarea>
      </div>
    </div>
    <div class="modal-footer" style="display:flex; justify-content:space-between; align-items:center;">
      <span style="font-size:12px; color:var(--text-muted);">Current: ${item.confirmedText}</span>
      <div style="display:flex; gap:8px;">
        <button class="modal-btn secondary" onclick="closeModal()">Annuleren</button>
        <button class="modal-btn primary" onclick="saveNewMailVersion('${sectionKey}', '${langKey}')">Opslaan als Versie ${item.version + 1}</button>
      </div>
    </div>
  `;

  modal.classList.add('visible');
}

function saveNewMailVersion(sectionKey, langKey) {
  const item = MAIL_TEXTS_DATA[sectionKey]?.[langKey];
  if (!item) return;

  const subjectInput = document.getElementById('modal-mail-subject');
  const bodyInput = document.getElementById('modal-mail-body');
  if (subjectInput && bodyInput) {
    item.version = item.version + 1;
    item.subject = subjectInput.value.trim();
    item.body = bodyInput.value.trim();
    item.confirmed = false;
    item.confirmedText = `Version ${item.version}, a draft`;
    closeModal();
    renderMailTextsTables();
    showToast('Nieuwe versie opgeslagen', `Versie ${item.version} (draft) opgeslagen voor ${item.language}.`, 'info');
  }
}

function showMailTextsHelp() {
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!modal || !content) return;

  content.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">
        <span class="material-symbols-outlined" style="color:#d4a5d8;">mail</span>
        Mail texts & Outreach policy
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="modal-body" style="font-size:13.5px; line-height:1.6; color:var(--text-secondary);">
      <p style="margin-bottom:12px;">
        <strong>The two mails of the outreach round:</strong> One communication template for establishments, and one for auditors, provided across five official languages (English, Français, Español, Português, Deutsch).
      </p>
      <p style="margin-bottom:12px;">
        <strong>Confirmation requirement:</strong> Only a <em>confirmed text</em> is sent to recipients. Where a language has no confirmed text, the English one goes as fallback.
      </p>
      <p style="margin-bottom:0;">
        <strong>Version tracking:</strong> Any modification to a text results in a new numbered version (e.g. Version 2, a draft). Every outgoing mail permanently logs the exact version and language it was sent in.
      </p>
    </div>
    <div class="modal-footer">
      <button class="modal-btn primary" onclick="closeModal()">Begrepen</button>
    </div>
  `;

  modal.classList.add('visible');
}

function showPartiesMailTexts() {
  ensurePartiesNavActive();
  hideAllViews();
  const el = document.getElementById('parties-mail-texts-view');
  if (el) el.classList.remove('hidden');

  updatePartiesSubNav('sub-parties-mail-texts');
  document.title = 'Audit Independer — Mail texts';
  renderMailTextsTables();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.renderMailTextsTables = renderMailTextsTables;
window.toggleMailTextPreview = toggleMailTextPreview;
window.confirmMailText = confirmMailText;
window.openWriteNewVersionModal = openWriteNewVersionModal;
window.saveNewMailVersion = saveNewMailVersion;
window.showMailTextsHelp = showMailTextsHelp;
window.showNationalOperators = showNationalOperators;
window.showPartiesRequests = showPartiesRequests;
window.showPartiesOutreach = showPartiesOutreach;
window.showPartiesMailTexts = showPartiesMailTexts;

function showRelationshipDetail(partyName) {
  ensurePartiesNavActive();
  hideAllViews();
  const el = document.getElementById('relationship-detail-view');
  if (el) el.classList.remove('hidden');

  const item = RELATIONSHIP_MAP[partyName] || ALL_RELATIONSHIPS[6] || ALL_RELATIONSHIPS[0];

  const titleEl = document.getElementById('rel-detail-title');
  if (titleEl) titleEl.textContent = `${item.name} — ${item.kind}`;

  const typeEl = document.getElementById('rel-detail-type');
  if (typeEl) typeEl.textContent = `${item.kind} · ${item.country}`;

  const contactEl = document.getElementById('rel-detail-contact');
  if (contactEl) contactEl.textContent = item.contactPerson || 'No contacts recorded.';

  const emailEl = document.getElementById('rel-detail-email');
  if (emailEl) emailEl.textContent = item.email || '—';

  const phoneEl = document.getElementById('rel-detail-phone');
  if (phoneEl) phoneEl.textContent = item.phone || '—';

  document.title = `Audit Independer — ${item.name}`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── Watch Routing & Functions ───

function updateWatchSubNav(activeId) {
  const links = [
    'sub-watch-daily',
    'sub-watch-office',
    'sub-watch-deadlines',
    'sub-watch-imports',
    'sub-watch-messages',
    'sub-watch-bounces',
    'sub-watch-payments',
    'sub-watch-sentback'
  ];
  links.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === activeId) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    }
  });
}

function showWatchNav() {
  ensureWatchNavActive();
  showWatchDailySummary();
}

function showWatchDailySummary() {
  ensureWatchNavActive();
  hideAllViews();
  const el = document.getElementById('watch-daily-summary-view');
  if (el) el.classList.remove('hidden');
  updateWatchSubNav('sub-watch-daily');
  document.title = 'Audit Independer — Daily summary';
  renderDailySummaries();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showWatchOfficeOverview() {
  ensureWatchNavActive();
  hideAllViews();
  const el = document.getElementById('watch-office-overview-view');
  if (el) el.classList.remove('hidden');
  updateWatchSubNav('sub-watch-office');
  document.title = 'Audit Independer — Office overview';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showWatchDeadlines() {
  ensureWatchNavActive();
  hideAllViews();
  const el = document.getElementById('watch-deadlines-view');
  if (el) el.classList.remove('hidden');
  updateWatchSubNav('sub-watch-deadlines');
  document.title = 'Audit Independer — Deadlines';
  renderDeadlinesTable();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showWatchImportRuns() {
  ensureWatchNavActive();
  hideAllViews();
  const el = document.getElementById('watch-import-runs-view');
  if (el) el.classList.remove('hidden');
  updateWatchSubNav('sub-watch-imports');
  document.title = 'Audit Independer — Import runs';
  renderImportRunsTable();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showWatchMessages() {
  ensureWatchNavActive();
  hideAllViews();
  const el = document.getElementById('watch-messages-view');
  if (el) el.classList.remove('hidden');
  updateWatchSubNav('sub-watch-messages');
  document.title = 'Audit Independer — Messages';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showWatchBounces() {
  ensureWatchNavActive();
  hideAllViews();
  const el = document.getElementById('watch-bounces-view');
  if (el) el.classList.remove('hidden');
  updateWatchSubNav('sub-watch-bounces');
  document.title = 'Audit Independer — Bounces';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const PAYMENTS_RECEIVED_DATA = [
  { received: '25 Aug 2026 07:03', fee: 'Audit fee', about: 'Dossier 26', amount: 'EUR 450.00', reference: '—', type: 'dossier', targetId: '26', dossierRef: 'A-2026-00026' },
  { received: '25 Aug 2026 07:03', fee: 'Audit fee', about: 'Dossier 6', amount: 'EUR 450.00', reference: '—', type: 'dossier', targetId: '6', dossierRef: 'A-2026-00006' },
  { received: '15 Aug 2026 07:03', fee: 'Audit fee', about: 'Dossier 23', amount: 'EUR 450.00', reference: '—', type: 'dossier', targetId: '23', dossierRef: 'A-2026-00023' },
  { received: '8 Aug 2026 07:03', fee: 'Establishment Fee', about: 'GK90026 — Herberg Het Concept', amount: 'EUR 300.00', reference: '—', type: 'establishment', targetId: '26', estRef: 'GK90026' },
  { received: '8 Aug 2026 07:03', fee: 'Establishment Fee', about: 'GK90006 — Congrescentrum De Blauwe Zaal', amount: 'EUR 300.00', reference: '—', type: 'establishment', targetId: '6', estRef: 'GK90006' },
  { received: '29 Jul 2026 07:03', fee: 'Establishment Fee', about: 'GK90023 — Camping Het Bedachte Bos', amount: 'EUR 300.00', reference: '—', type: 'establishment', targetId: '23', estRef: 'GK90023' },
  { received: '26 Jul 2026 07:03', fee: 'Audit fee', about: 'Dossier 7', amount: 'EUR 450.00', reference: '—', type: 'dossier', targetId: '7', dossierRef: 'A-2026-00007' },
  { received: '16 Jul 2026 07:03', fee: 'Audit fee', about: 'Dossier 24', amount: 'EUR 450.00', reference: '—', type: 'dossier', targetId: '24', dossierRef: 'A-2026-00024' },
  { received: '9 Jul 2026 07:03', fee: 'Establishment Fee', about: 'GK90007 — Attractiepark Luchtkasteel', amount: 'EUR 300.00', reference: '—', type: 'establishment', targetId: '7', estRef: 'GK90007' },
  { received: '29 Jun 2026 07:03', fee: 'Establishment Fee', about: 'GK90024 — Hostel Nergenshuis', amount: 'EUR 300.00', reference: '—', type: 'establishment', targetId: '24', estRef: 'GK90024' },
  { received: '26 Jun 2026 07:03', fee: 'Audit fee', about: 'Dossier 8', amount: 'EUR 450.00', reference: '—', type: 'dossier', targetId: '8', dossierRef: 'A-2026-00008' },
  { received: '16 Jun 2026 07:03', fee: 'Audit fee', about: 'Dossier 25', amount: 'EUR 450.00', reference: '—', type: 'dossier', targetId: '25', dossierRef: 'A-2026-00025' },
  { received: '9 Jun 2026 07:03', fee: 'Establishment Fee', about: 'GK90008 — Hotel Spiegelgracht', amount: 'EUR 300.00', reference: '—', type: 'establishment', targetId: '8', estRef: 'GK90008' },
  { received: '30 May 2026 07:03', fee: 'Establishment Fee', about: 'GK90025 — Chalet De Bedachte Berg', amount: 'EUR 300.00', reference: '—', type: 'establishment', targetId: '25', estRef: 'GK90025' },
  { received: '27 May 2026 07:03', fee: 'Audit fee', about: 'Dossier 19', amount: 'EUR 450.00', reference: '—', type: 'dossier', targetId: '19', dossierRef: 'A-2026-00019' },
  { received: '10 May 2026 07:03', fee: 'Establishment Fee', about: 'GK90019 — Camping Terzijde', amount: 'EUR 300.00', reference: '—', type: 'establishment', targetId: '19', estRef: 'GK90019' },
  { received: '18 Mar 2026 06:03', fee: 'Audit fee', about: 'Dossier 9', amount: 'EUR 450.00', reference: '—', type: 'dossier', targetId: '9', dossierRef: 'A-2026-00009' },
  { received: '1 Mar 2026 06:03', fee: 'Establishment Fee', about: 'GK90009 — Bed en Ontbijt De Marge', amount: 'EUR 300.00', reference: '—', type: 'establishment', targetId: '9', estRef: 'GK90009' },
  { received: '17 Jan 2026 06:03', fee: 'Audit fee', about: 'Dossier 20', amount: 'EUR 450.00', reference: '—', type: 'dossier', targetId: '20', dossierRef: 'A-2026-00020' },
  { received: '31 Dec 2025 06:03', fee: 'Establishment Fee', about: 'GK90020 — Hotel Sluitsteen', amount: 'EUR 300.00', reference: '—', type: 'establishment', targetId: '20', estRef: 'GK90020' },
  { received: '28 Dec 2025 06:03', fee: 'Audit fee', about: 'Dossier 10', amount: 'EUR 450.00', reference: '—', type: 'dossier', targetId: '10', dossierRef: 'A-2025-00010' },
  { received: '11 Dec 2025 06:03', fee: 'Establishment Fee', about: 'GK90010 — Camping Het Lege Veld', amount: 'EUR 300.00', reference: '—', type: 'establishment', targetId: '10', estRef: 'GK90010' },
  { received: '8 Nov 2025 06:03', fee: 'Audit fee', about: 'Dossier 17', amount: 'EUR 450.00', reference: '—', type: 'dossier', targetId: '17', dossierRef: 'A-2025-00017' },
  { received: '22 Oct 2025 07:03', fee: 'Establishment Fee', about: 'GK90017 — Hotel Kladblok', amount: 'EUR 300.00', reference: '—', type: 'establishment', targetId: '17', estRef: 'GK90017' },
  { received: '19 Sep 2025 07:03', fee: 'Audit fee', about: 'Dossier 11', amount: 'EUR 450.00', reference: '—', type: 'dossier', targetId: '11', dossierRef: 'A-2025-00011' },
  { received: '2 Sep 2025 07:03', fee: 'Establishment Fee', about: 'GK90011 — Restaurant Vier Gangen', amount: 'EUR 300.00', reference: '—', type: 'establishment', targetId: '11', estRef: 'GK90011' },
  { received: '31 Jul 2025 07:03', fee: 'Audit fee', about: 'Dossier 18', amount: 'EUR 450.00', reference: '—', type: 'dossier', targetId: '18', dossierRef: 'A-2025-00018' },
  { received: '14 Jul 2025 07:03', fee: 'Establishment Fee', about: 'GK90018 — Restaurant De Voetnoot', amount: 'EUR 300.00', reference: '—', type: 'establishment', targetId: '18', estRef: 'GK90018' },
  { received: '11 Jun 2025 07:03', fee: 'Audit fee', about: 'Dossier 14', amount: 'EUR 450.00', reference: '—', type: 'dossier', targetId: '14', dossierRef: 'A-2025-00014' },
  { received: '25 May 2025 07:03', fee: 'Establishment Fee', about: 'GK90014 — Vakantiepark Schetsmatig', amount: 'EUR 300.00', reference: '—', type: 'establishment', targetId: '14', estRef: 'GK90014' },
  { received: '3 Mar 2025 06:03', fee: 'Audit fee', about: 'Dossier 16', amount: 'EUR 450.00', reference: '—', type: 'dossier', targetId: '16', dossierRef: 'A-2025-00016' },
  { received: '14 Feb 2025 06:03', fee: 'Establishment Fee', about: 'GK90016 — Attractie De Draaimolen', amount: 'EUR 300.00', reference: '—', type: 'establishment', targetId: '16', estRef: 'GK90016' }
];

function renderPaymentsReceivedTable() {
  const tbody = document.getElementById('payments-received-tbody');
  if (!tbody) return;

  tbody.innerHTML = PAYMENTS_RECEIVED_DATA.map((item, index) => {
    return `
      <tr>
        <td class="pb-received-cell">${item.received}</td>
        <td class="pb-fee-cell">${item.fee}</td>
        <td class="pb-about-cell">${item.about}</td>
        <td class="pb-amount-cell">${item.amount}</td>
        <td class="pb-ref-cell">${item.reference}</td>
        <td style="text-align: right;">
          <a href="#" class="pb-open-link" onclick="openPaymentTarget(${index}); return false;">
            <span class="material-symbols-outlined" style="font-size:15px;">visibility</span> Open
          </a>
        </td>
      </tr>
    `;
  }).join('');
}

function openPaymentTarget(index) {
  const item = PAYMENTS_RECEIVED_DATA[index];
  if (!item) return;

  currentOriginView = 'watch';
  if (item.type === 'dossier') {
    showToast('Open dossier', `Navigeren naar ${item.about}...`, 'info');
    showDossierDetail(item.dossierRef);
  } else if (item.type === 'establishment') {
    showToast('Open vestiging', `Navigeren naar ${item.about}...`, 'info');
    showEstablishmentDetail(item.estRef);
  }
}

function showPaymentsBookingsHelp() {
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!modal || !content) return;

  content.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">
        <span class="material-symbols-outlined" style="color:#60a5fa;">account_balance</span>
        Payments and bookings policy
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="modal-body" style="font-size:13.5px; line-height:1.6; color:var(--text-secondary);">
      <p style="margin-bottom:12px;">
        <strong>What came in, and what the bookkeeping is being asked to do:</strong>
        Nothing is booked or sent from here, and while the bookkeeping has no key, nothing leaves this system: a booking is written down and waits.
      </p>
      <div style="background:#131822; border:1px solid #1f293d; border-radius:8px; padding:14px; margin-bottom:12px;">
        <div style="font-weight:600; color:var(--text-primary); margin-bottom:4px;">Refused: no invoice was drawn up</div>
        <div style="font-size:12.5px; color:var(--text-muted);">Incoming transactions that cannot be reconciled to any existing invoice or dossier are held here.</div>
      </div>
      <div style="background:#131822; border:1px solid #1f293d; border-radius:8px; padding:14px; margin-bottom:12px;">
        <div style="font-weight:600; color:var(--text-primary); margin-bottom:4px;">Bookings prepared</div>
        <div style="font-size:12.5px; color:var(--text-muted);">Queued ledger bookings prepared for automated accounting export.</div>
      </div>
      <div style="background:#131822; border:1px solid #1f293d; border-radius:8px; padding:14px;">
        <div style="font-weight:600; color:var(--text-primary); margin-bottom:4px;">Payments received</div>
        <div style="font-size:12.5px; color:var(--text-muted);">The latest 32 recorded fee receipts for establishment fees (€ 300.00) and audit fees (€ 450.00).</div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="modal-btn primary" onclick="closeModal()">Begrepen</button>
    </div>
  `;

  modal.classList.add('visible');
}

function showWatchPayments() {
  ensureWatchNavActive();
  hideAllViews();
  const el = document.getElementById('watch-payments-view');
  if (el) el.classList.remove('hidden');
  updateWatchSubNav('sub-watch-payments');
  document.title = 'Audit Independer — Payments and bookings';
  renderPaymentsReceivedTable();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.renderPaymentsReceivedTable = renderPaymentsReceivedTable;
window.openPaymentTarget = openPaymentTarget;
window.showPaymentsBookingsHelp = showPaymentsBookingsHelp;
window.showWatchPayments = showWatchPayments;

function showWatchSentBack() {
  ensureWatchNavActive();
  hideAllViews();
  const el = document.getElementById('watch-sentback-view');
  if (el) el.classList.remove('hidden');
  updateWatchSubNav('sub-watch-sentback');
  document.title = 'Audit Independer — Sent-back files';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setOfficeContinent(continent, btnElem) {
  const buttons = document.querySelectorAll('#office-continent-filters .office-continent-btn');
  buttons.forEach(b => b.classList.remove('active'));
  if (btnElem) btnElem.classList.add('active');

  const names = {
    all: 'All',
    europe: 'Europe',
    americas: 'Americas',
    asia: 'Asia',
    africa: 'Africa',
    oceania: 'Oceania'
  };
  const name = names[continent] || 'All';
  const todaySub = document.getElementById('office-today-sub');
  const weekSub = document.getElementById('office-week-sub');
  const monthSub = document.getElementById('office-month-sub');
  if (todaySub) todaySub.textContent = `Wed 7 Oct · ${name}`;
  if (weekSub) weekSub.textContent = `5 Oct – 11 Oct · ${name}`;
  if (monthSub) monthSub.textContent = `October 2026 · ${name}`;
}

function pinContinent() {
  const activeBtn = document.querySelector('#office-continent-filters .office-continent-btn.active');
  const txt = activeBtn ? activeBtn.textContent.split(' ')[0] : 'All';
  const nextLabel = document.querySelector('.office-next-label');
  if (nextLabel) {
    nextLabel.textContent = `Pinned: ${txt}`;
  }
}

function openEstablishmentByRef(ref) {
  currentOriginView = 'watch';
  showEstablishmentDetail(ref || 'GK01357');
}

function openEstablishmentByName(name) {
  currentOriginView = 'watch';
  const est = ALL_ESTABLISHMENTS.find(e => e.name.toLowerCase().includes(name.toLowerCase()));
  if (est) {
    showEstablishmentDetail(est.reference);
  } else {
    showEstablishmentsList();
  }
}

function openDossierFromSentBack(gkId) {
  currentOriginView = 'sentback';
  const dossier = ALL_DOSSIERS.find(d => d.gkId === gkId);
  if (dossier) {
    showDossierDetail(dossier.dossierNumber);
  } else {
    showDossierDetail('A-2026-00011');
  }
}

function removeSentBackFile(rowId) {
  if (confirm('Are you sure you want to remove 2.2.jpg from dossier GK90011?')) {
    const row = document.getElementById(rowId);
    if (row) row.remove();
    const tbody = document.getElementById('sentback-tbody');
    if (tbody && tbody.children.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 3.5rem 1rem; color: var(--text-muted); font-size: 13px;">
            No files have been sent back.
          </td>
        </tr>
      `;
    }
    const badge = document.querySelector('#sub-watch-sentback .sub-pill');
    if (badge) badge.style.display = 'none';
  }
}

function renderDailySummaries() {
  const tbody = document.getElementById('watch-daily-summary-tbody');
  if (!tbody) return;
  tbody.innerHTML = DAILY_SUMMARIES.map(row => `
    <tr>
      <td style="font-weight: 500; color: var(--text-primary); white-space: nowrap;">${row.day}</td>
      <td style="color: var(--text-muted); font-size: 12.5px; line-height: 1.45;">${row.summary}</td>
      <td style="color: var(--text-muted); font-size: 12px;"></td>
    </tr>
  `).join('');
}

let deadlinesCurrentPage = 1;
let deadlinesPerPage = 10;
let deadlinesSearchQuery = '';
let deadlinesFilterSubject = 'all'; // 'all', 'Establishment', 'Dossier'
let deadlinesFilterStatus = 'all'; // 'all', 'Fulfilled', 'Overdue'

function getFilteredDeadlines() {
  const q = (deadlinesSearchQuery || '').toLowerCase().trim();
  return ALL_DEADLINES.filter(d => {
    if (deadlinesFilterSubject !== 'all' && d.subject !== deadlinesFilterSubject) {
      return false;
    }
    if (deadlinesFilterStatus !== 'all' && d.status !== deadlinesFilterStatus) {
      return false;
    }
    if (q) {
      const match = d.establishment.toLowerCase().includes(q) ||
                    d.deadline.toLowerCase().includes(q) ||
                    d.subject.toLowerCase().includes(q) ||
                    d.status.toLowerCase().includes(q) ||
                    String(d.number).includes(q) ||
                    d.countedFrom.toLowerCase().includes(q) ||
                    d.due.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });
}

function renderDeadlinesTable() {
  const tbody = document.getElementById('deadlines-tbody');
  if (!tbody) return;

  const filtered = getFilteredDeadlines();
  const totalCount = filtered.length;
  const totalPages = Math.ceil(totalCount / deadlinesPerPage) || 1;

  if (deadlinesCurrentPage > totalPages) {
    deadlinesCurrentPage = totalPages;
  }
  if (deadlinesCurrentPage < 1) {
    deadlinesCurrentPage = 1;
  }

  const startIndex = (deadlinesCurrentPage - 1) * deadlinesPerPage;
  const endIndex = Math.min(startIndex + deadlinesPerPage, totalCount);
  const pageItems = filtered.slice(startIndex, endIndex);

  // Update results summary above table (e.g. "287 results")
  const resultsCountEl = document.getElementById('deadlines-results-count');
  if (resultsCountEl) {
    resultsCountEl.textContent = `${totalCount} results`;
  }

  // Update pagination count text (e.g. "Showing 1 to 10 of 287 results")
  const countEl = document.getElementById('deadlines-pagination-count');
  if (countEl) {
    if (totalCount === 0) {
      countEl.textContent = 'Showing 0 results';
    } else {
      countEl.textContent = `Showing ${startIndex + 1} to ${endIndex} of ${totalCount} results`;
    }
  }

  // Update filter badge and active styling
  const filterBadge = document.getElementById('deadlines-filter-badge');
  const filterBtn = document.getElementById('deadlines-filter-btn');
  let activeFilterCount = 0;
  if (deadlinesFilterSubject !== 'all') activeFilterCount++;
  if (deadlinesFilterStatus !== 'all') activeFilterCount++;
  if (filterBadge) filterBadge.textContent = activeFilterCount;
  if (filterBtn) {
    if (activeFilterCount > 0) {
      filterBtn.classList.add('has-filters');
    } else {
      filterBtn.classList.remove('has-filters');
    }
  }

  // Render Table Rows
  if (pageItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 36px; color: var(--text-muted);">
          No deadlines found matching your filter criteria.
        </td>
      </tr>
    `;
  } else {
    tbody.innerHTML = pageItems.map(d => {
      const isOverdue = d.status.toLowerCase() === 'overdue';
      const statusClass = isOverdue ? 'status-overdue' : 'status-fulfilled';
      return `
        <tr>
          <td>
            <span class="deadline-subject-tag">${d.subject}</span>
          </td>
          <td class="deadline-number-cell">${d.number}</td>
          <td>
            <a href="#" class="establishment-link" onclick="openEstablishmentByRef('${d.establishmentRef}'); return false;">
              ${d.establishment}
            </a>
          </td>
          <td>
            <span class="deadline-title-cell" onclick="openDeadlineDetail(${d.id});" style="cursor: pointer;" title="Klik voor details van deze termijn">${d.deadline}</span>
          </td>
          <td>
            <span class="deadline-status-pill ${statusClass}">${d.status}</span>
          </td>
          <td class="deadline-due-cell">${d.due}</td>
          <td>
            <span class="deadline-counted-cell" title="${d.countedFrom}">${d.countedFrom}</span>
          </td>
          <td class="deadline-observed-cell">${d.observed}</td>
          <td style="text-align: right;">
            <a href="#" class="deadline-open-link" onclick="openDeadlineTarget(${d.id}); return false;" title="Open ${d.subject.toLowerCase()}">
              <span class="material-symbols-outlined" style="font-size:15px;">open_in_new</span> Open
            </a>
          </td>
        </tr>
      `;
    }).join('');
  }

  renderDeadlinesPagination(totalPages);
}

function renderDeadlinesPagination(totalPages) {
  const container = document.getElementById('deadlines-page-numbers');
  if (!container) return;

  let html = '';
  // Prev button
  const prevDisabled = deadlinesCurrentPage === 1;
  html += `
    <button class="page-btn prev" ${prevDisabled ? 'disabled style="opacity:0.35; cursor:not-allowed;"' : ''} onclick="setDeadlinesPage(${deadlinesCurrentPage - 1})" title="Vorige pagina">
      <span class="material-symbols-outlined" style="font-size:16px;">chevron_left</span>
    </button>
  `;

  if (totalPages <= 7) {
    for (let p = 1; p <= totalPages; p++) {
      html += `<button class="page-btn ${p === deadlinesCurrentPage ? 'active' : ''}" onclick="setDeadlinesPage(${p})">${p}</button>`;
    }
  } else {
    if (deadlinesCurrentPage <= 4) {
      for (let p = 1; p <= 4; p++) {
        html += `<button class="page-btn ${p === deadlinesCurrentPage ? 'active' : ''}" onclick="setDeadlinesPage(${p})">${p}</button>`;
      }
      html += `<span class="page-ellipsis">...</span>`;
      html += `<button class="page-btn ${totalPages - 1 === deadlinesCurrentPage ? 'active' : ''}" onclick="setDeadlinesPage(${totalPages - 1})">${totalPages - 1}</button>`;
      html += `<button class="page-btn ${totalPages === deadlinesCurrentPage ? 'active' : ''}" onclick="setDeadlinesPage(${totalPages})">${totalPages}</button>`;
    } else if (deadlinesCurrentPage >= totalPages - 3) {
      html += `<button class="page-btn" onclick="setDeadlinesPage(1)">1</button>`;
      html += `<button class="page-btn" onclick="setDeadlinesPage(2)">2</button>`;
      html += `<span class="page-ellipsis">...</span>`;
      for (let p = totalPages - 3; p <= totalPages; p++) {
        html += `<button class="page-btn ${p === deadlinesCurrentPage ? 'active' : ''}" onclick="setDeadlinesPage(${p})">${p}</button>`;
      }
    } else {
      html += `<button class="page-btn" onclick="setDeadlinesPage(1)">1</button>`;
      html += `<span class="page-ellipsis">...</span>`;
      html += `<button class="page-btn" onclick="setDeadlinesPage(${deadlinesCurrentPage - 1})">${deadlinesCurrentPage - 1}</button>`;
      html += `<button class="page-btn active" onclick="setDeadlinesPage(${deadlinesCurrentPage})">${deadlinesCurrentPage}</button>`;
      html += `<button class="page-btn" onclick="setDeadlinesPage(${deadlinesCurrentPage + 1})">${deadlinesCurrentPage + 1}</button>`;
      html += `<span class="page-ellipsis">...</span>`;
      html += `<button class="page-btn" onclick="setDeadlinesPage(${totalPages})">${totalPages}</button>`;
    }
  }

  // Next button
  const nextDisabled = deadlinesCurrentPage === totalPages;
  html += `
    <button class="page-btn next" ${nextDisabled ? 'disabled style="opacity:0.35; cursor:not-allowed;"' : ''} onclick="setDeadlinesPage(${deadlinesCurrentPage + 1})" title="Volgende pagina">
      <span class="material-symbols-outlined" style="font-size:16px;">chevron_right</span>
    </button>
  `;

  container.innerHTML = html;
}

function setDeadlinesPage(p) {
  const filtered = getFilteredDeadlines();
  const totalPages = Math.ceil(filtered.length / deadlinesPerPage) || 1;
  if (p < 1 || p > totalPages) return;
  deadlinesCurrentPage = p;
  renderDeadlinesTable();
  const table = document.getElementById('deadlines-table');
  if (table) table.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setDeadlinesPerPage(perPage) {
  deadlinesPerPage = Number(perPage);
  deadlinesCurrentPage = 1;
  const options = document.querySelectorAll('#deadlines-per-page-options .per-page-btn');
  options.forEach(btn => {
    if (Number(btn.textContent.trim()) === deadlinesPerPage) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  renderDeadlinesTable();
}

function onDeadlinesSearchChange() {
  const input = document.getElementById('deadlines-search-input');
  deadlinesSearchQuery = input ? input.value : '';
  deadlinesCurrentPage = 1;
  renderDeadlinesTable();
}

function filterDeadlinesTable() {
  onDeadlinesSearchChange();
}

function openDeadlinesFilterModal() {
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!modal || !content) return;

  content.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">
        <span class="material-symbols-outlined" style="color:#3b82f6;">filter_list</span>
        Filter Deadlines
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="modal-body" style="display:flex; flex-direction:column; gap:16px;">
      <div>
        <label style="display:block; font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">
          Subject
        </label>
        <select id="modal-filter-subject" class="steel-input" style="width:100%; height:36px; background:#182232; color:#fff; border:1px solid #2d3b52; border-radius:6px; padding:0 8px;">
          <option value="all" ${deadlinesFilterSubject === 'all' ? 'selected' : ''}>All subjects</option>
          <option value="Establishment" ${deadlinesFilterSubject === 'Establishment' ? 'selected' : ''}>Establishment</option>
          <option value="Dossier" ${deadlinesFilterSubject === 'Dossier' ? 'selected' : ''}>Dossier</option>
        </select>
      </div>

      <div>
        <label style="display:block; font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">
          Status
        </label>
        <select id="modal-filter-status" class="steel-input" style="width:100%; height:36px; background:#182232; color:#fff; border:1px solid #2d3b52; border-radius:6px; padding:0 8px;">
          <option value="all" ${deadlinesFilterStatus === 'all' ? 'selected' : ''}>All statuses</option>
          <option value="Fulfilled" ${deadlinesFilterStatus === 'Fulfilled' ? 'selected' : ''}>Fulfilled</option>
          <option value="Overdue" ${deadlinesFilterStatus === 'Overdue' ? 'selected' : ''}>Overdue</option>
        </select>
      </div>
    </div>
    <div class="modal-footer" style="display:flex; justify-content:space-between; align-items:center;">
      <button class="modal-btn secondary" onclick="resetDeadlinesFilter()">Reset filters</button>
      <div style="display:flex; gap:8px;">
        <button class="modal-btn secondary" onclick="closeModal()">Annuleren</button>
        <button class="modal-btn primary" onclick="applyDeadlinesFilterFromModal()">Toepassen</button>
      </div>
    </div>
  `;

  modal.classList.add('visible');
}

function applyDeadlinesFilterFromModal() {
  const subjSel = document.getElementById('modal-filter-subject');
  const statSel = document.getElementById('modal-filter-status');
  if (subjSel) deadlinesFilterSubject = subjSel.value;
  if (statSel) deadlinesFilterStatus = statSel.value;
  deadlinesCurrentPage = 1;
  closeModal();
  renderDeadlinesTable();
  showToast('Filters toegepast', `Deadlines gefilterd (${deadlinesFilterSubject !== 'all' ? deadlinesFilterSubject : 'Alle'}, ${deadlinesFilterStatus !== 'all' ? deadlinesFilterStatus : 'Alle status'}).`, 'info');
}

function resetDeadlinesFilter() {
  deadlinesFilterSubject = 'all';
  deadlinesFilterStatus = 'all';
  deadlinesCurrentPage = 1;
  closeModal();
  renderDeadlinesTable();
  showToast('Filters gewist', 'Alle filters op deadlines zijn teruggezet.', 'info');
}

function openDeadlineDetail(id) {
  const item = ALL_DEADLINES.find(d => Number(d.id) === Number(id));
  if (!item) return;

  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!modal || !content) return;

  const isOverdue = item.status.toLowerCase() === 'overdue';
  const statusBadge = isOverdue
    ? '<span class="deadline-status-pill status-overdue">Overdue</span>'
    : '<span class="deadline-status-pill status-fulfilled">Fulfilled</span>';

  content.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">
        <span class="material-symbols-outlined" style="color:#60a5fa;">schedule</span>
        Deadline obligation #${item.id}
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="modal-body" style="font-size:13.5px; line-height:1.6; color:var(--text-secondary);">
      <div style="background:#131822; border:1px solid #1f293d; border-radius:8px; padding:16px; margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <span class="deadline-subject-tag">${item.subject}</span>
          ${statusBadge}
        </div>
        <div style="font-size:15px; font-weight:600; color:var(--text-primary); margin-bottom:6px;">
          ${item.deadline}
        </div>
        <div style="color:#93c5fd; font-size:13px; margin-bottom:12px;">
          ${item.establishment} (Number: ${item.number})
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:12.5px; border-top:1px solid #1f293d; padding-top:12px;">
          <div>
            <div style="color:var(--text-muted); font-size:11px; text-transform:uppercase;">Due date</div>
            <div style="font-weight:600; color:var(--text-primary);">${item.due}</div>
          </div>
          <div>
            <div style="color:var(--text-muted); font-size:11px; text-transform:uppercase;">Observed timestamp</div>
            <div style="color:var(--text-secondary);">${item.observed}</div>
          </div>
        </div>
      </div>

      <div style="margin-bottom:12px;">
        <div style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">Trigger obligation (Counted from):</div>
        <div style="padding:10px 14px; background:#182232; border-radius:6px; font-size:12.5px; color:#cbd5e1; font-style:italic;">
          "${item.countedFrom}"
        </div>
      </div>
    </div>
    <div class="modal-footer" style="display:flex; justify-content:space-between;">
      <div style="display:flex; gap:8px;">
        <button class="modal-btn secondary" onclick="closeModal(); openEstablishmentByRef('${item.establishmentRef}');">
          <span class="material-symbols-outlined" style="font-size:15px;">storefront</span> Naar vestiging
        </button>
        <button class="modal-btn secondary" onclick="closeModal(); showDossier('${item.dossierId}', 'watch');">
          <span class="material-symbols-outlined" style="font-size:15px;">folder</span> Naar dossier
        </button>
      </div>
      <button class="modal-btn primary" onclick="closeModal()">Sluiten</button>
    </div>
  `;

  modal.classList.add('visible');
}

function showDossierDetail(dossierId) {
  showDossier(dossierId, 'watch');
}
window.showDossierDetail = showDossierDetail;

function openDeadlineTarget(id) {
  const item = ALL_DEADLINES.find(d => Number(d.id) === Number(id));
  if (!item) {
    console.warn('Deadline target not found for id:', id);
    return;
  }
  const isDossier = (item.subject || '').toLowerCase() === 'dossier';
  if (isDossier) {
    showDossier(item.dossierId || 'A-2025-00016', 'watch');
  } else {
    openEstablishmentByRef(item.establishmentRef || 'GK90016');
  }
}
window.openDeadlineTarget = openDeadlineTarget;

function showDeadlinesHelp() {
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!modal || !content) return;

  content.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">
        <span class="material-symbols-outlined" style="color:#60a5fa;">help</span>
        Deadlines (Term-alerts) Monitoring
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="modal-body" style="font-size:13.5px; line-height:1.6; color:var(--text-secondary);">
      <p style="margin-bottom:12px;">
        <strong>Deadlines monitored by the system:</strong> Every deadline is tied to an obligation arising from a rule or milestone, counted from a trigger event.
      </p>
      <p style="margin-bottom:12px;">
        <strong>Statutory & operational tracking:</strong> Triggers include agreement sign-off, auditor proposals, fee receipts, inspection reports, and decision windows.
      </p>
      <p style="margin-bottom:12px;">
        <strong>Status evaluation:</strong>
        <br>• <span class="deadline-status-pill status-fulfilled" style="margin-top:4px;">Fulfilled</span>: The condition was met and recorded on or before the due date.
        <br>• <span class="deadline-status-pill status-overdue" style="margin-top:4px;">Overdue</span>: The deadline passed without the obligation being fulfilled.
      </p>
      <p style="margin-bottom:0;">
        Overdue deadlines are surfaced in the <em>Daily summary</em> and trigger escalation notifications to scheme coordinators.
      </p>
    </div>
    <div class="modal-footer">
      <button class="modal-btn primary" onclick="closeModal()">Begrepen</button>
    </div>
  `;

  modal.classList.add('visible');
}

window.renderDeadlinesTable = renderDeadlinesTable;
window.setDeadlinesPage = setDeadlinesPage;
window.setDeadlinesPerPage = setDeadlinesPerPage;
window.onDeadlinesSearchChange = onDeadlinesSearchChange;
window.filterDeadlinesTable = filterDeadlinesTable;
window.openDeadlinesFilterModal = openDeadlinesFilterModal;
window.applyDeadlinesFilterFromModal = applyDeadlinesFilterFromModal;
window.resetDeadlinesFilter = resetDeadlinesFilter;
window.openDeadlineDetail = openDeadlineDetail;
window.showDeadlinesHelp = showDeadlinesHelp;

function renderImportRunsTable() {
  const tbody = document.getElementById('import-runs-tbody');
  if (!tbody) return;
  tbody.innerHTML = ALL_IMPORT_RUNS.map(run => {
    let notReadHtml = '';
    if (run.notRead) {
      notReadHtml = run.notRead.map(tag => `<span class="not-read-pill">${tag}</span>`).join(' ');
    } else if (run.notReadText) {
      notReadHtml = `<span style="color: var(--text-muted); font-size: 12px;">${run.notReadText}</span>`;
    }

    return `
      <tr>
        <td style="white-space: nowrap; font-size: 12px; color: var(--text-secondary);">${run.started}</td>
        <td style="font-size: 12.5px; color: var(--text-primary);">${run.source}</td>
        <td>
          <span class="kind-pill" style="background: rgba(59, 130, 246, 0.15); color: #93c5fd; border-color: rgba(59, 130, 246, 0.35);">
            ${run.status}
          </span>
        </td>
        <td class="mono" style="text-align: right; font-size: 12px; color: var(--text-secondary);">${run.read.toLocaleString()}</td>
        <td class="mono" style="text-align: right; font-size: 12px; color: var(--text-secondary);">${run.created.toLocaleString()}</td>
        <td class="mono" style="text-align: right; font-size: 12px; color: var(--text-secondary);">${run.changed.toLocaleString()}</td>
        <td class="mono" style="text-align: right; font-size: 12px; color: ${run.refused > 0 ? '#fbbf24' : 'var(--text-muted)'};">${run.refused.toLocaleString()}</td>
        <td>${notReadHtml}</td>
      </tr>
    `;
  }).join('');
}

function renderRelationshipTable(searchVal = '') {
  const tbody = document.getElementById('rel-table-body');
  if (!tbody) return;

  const query = searchVal.toLowerCase().trim();
  const filtered = ALL_RELATIONSHIPS.filter(r => {
    // Filter pill matching
    if (currentRelFilter === 'establishments' && r.kind !== 'Establishment') return false;
    if (currentRelFilter === 'national-operators' && r.kind !== 'National Operator') return false;
    if (currentRelFilter === 'auditors' && r.kind !== 'Auditor') return false;
    if (currentRelFilter === 'open-actions' && r.openActions === 0) return false;

    // Search query matching
    if (!query) return true;
    return r.name.toLowerCase().includes(query) ||
           r.country.toLowerCase().includes(query) ||
           r.contactPerson.toLowerCase().includes(query);
  });

  tbody.innerHTML = filtered.map(r => {
    const isEst = r.kind === 'Establishment';
    const kindBadgeClass = isEst ? 'kind-pill establishment' : 'kind-pill';

    return `
      <tr class="clickable-row" onclick="showRelationshipDetail('${r.name.replace(/'/g, "\\'")}')">
        <td>
          <div class="rel-name-title">${r.name}</div>
          <div class="rel-name-sub">${r.establishments} establishments · ${r.openDossiers} open dossiers</div>
        </td>
        <td><span class="${kindBadgeClass}">${r.kind}</span></td>
        <td>${r.country}</td>
        <td>${r.contactPerson}</td>
        <td>
          <div class="rel-date-title">${r.lastContactDate}</div>
          <div class="rel-date-sub">${r.lastContactType}</div>
        </td>
        <td>${r.openActions}</td>
        <td style="color: var(--text-secondary);">${r.nextAction}</td>
        <td class="open-btn-cell">
          <button class="open-row-btn" onclick="event.stopPropagation(); showRelationshipDetail('${r.name.replace(/'/g, "\\'")}')">
            <span class="material-symbols-outlined">visibility</span> Open
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterRelationshipTable() {
  const input = document.getElementById('rel-search-input');
  const val = input ? input.value : '';
  renderRelationshipTable(val);
}

function setRelFilter(filterKey) {
  currentRelFilter = filterKey;
  const pills = document.querySelectorAll('#rel-filter-pills .rel-filter-pill');
  pills.forEach(p => {
    if (p.dataset.relfilter === filterKey) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });

  const input = document.getElementById('rel-search-input');
  const val = input ? input.value : '';
  renderRelationshipTable(val);
}

function renderAuditorsTable(filterQuery = '') {
  const tbody = document.getElementById('auditors-table-body');
  if (!tbody) return;

  const query = filterQuery.toLowerCase().trim();
  const filtered = ALL_AUDITORS.filter(a => {
    if (!query) return true;
    return a.name.toLowerCase().includes(query) ||
           a.country.toLowerCase().includes(query) ||
           a.state.toLowerCase().includes(query);
  });

  tbody.innerHTML = filtered.map(a => {
    const isCandidate = a.state === 'Candidate';
    const stateBadgeClass = isCandidate ? 'badge-candidate' : 'badge-active-green';

    return `
      <tr class="auditor-row" onclick="showAuditorDetail('${a.name.replace(/'/g, "\\'")}')">
        <td style="font-weight: 600; color: #ffffff;">${a.name}</td>
        <td>${a.country}</td>
        <td style="color: var(--text-muted);">${a.workArea}</td>
        <td><span class="${stateBadgeClass}">${a.state}</span></td>
        <td>${a.contract}</td>
        <td style="color: var(--text-secondary);">${a.lastEvaluated}</td>
        <td style="color: var(--text-secondary);">${a.legalHold}</td>
        <td style="color: var(--text-secondary);">${a.chainsBarred}</td>
        <td class="open-btn-cell">
          <button class="open-row-btn" onclick="event.stopPropagation(); showAuditorDetail('${a.name.replace(/'/g, "\\'")}')">
            <span class="material-symbols-outlined">visibility</span>
            <span>Open</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  const countEl = document.getElementById('auditors-count-text');
  if (countEl) {
    countEl.textContent = `Showing ${filtered.length} of ${ALL_AUDITORS.length} results`;
  }
}

function filterAuditorsTable() {
  const searchInput = document.getElementById('auditors-search-input');
  const val = searchInput ? searchInput.value : '';
  renderAuditorsTable(val);
}

function showAuditorDetail(name) {
  ensurePartiesNavActive();
  hideAllViews();

  const auditor = AUDITOR_MAP[name] || ALL_AUDITORS[0];
  const el = document.getElementById('auditor-detail-view');
  if (el) el.classList.remove('hidden');

  // Populate Header
  const nameEl = document.getElementById('auditor-detail-name');
  if (nameEl) nameEl.textContent = auditor.name;

  const metaEl = document.getElementById('auditor-detail-meta');
  if (metaEl) {
    metaEl.textContent = `Auditor · ${auditor.countryFull} · ${auditor.email} · Last evaluated: ${auditor.lastEvaluated}`;
  }

  const badgeEl = document.getElementById('auditor-detail-badge');
  const badgeText = document.getElementById('auditor-detail-badge-text');
  if (badgeEl && badgeText) {
    if (auditor.state === 'Candidate') {
      badgeEl.className = 'auditor-warning-badge';
      badgeEl.querySelector('.material-symbols-outlined').textContent = 'warning';
      badgeText.textContent = 'Candidate: cannot be planned';
    } else {
      badgeEl.className = 'status-badge cert-granted';
      badgeEl.querySelector('.material-symbols-outlined').textContent = 'check_circle';
      badgeText.textContent = 'Active: can be planned';
    }
  }

  // Populate Lead
  const leadText = document.getElementById('auditor-lead-text');
  const leadSub = document.getElementById('auditor-lead-sub');
  if (leadText && leadSub) {
    if (auditor.state === 'Candidate') {
      leadText.textContent = `Not active in the register (Candidate), so nobody can plan this auditor. ${auditor.missingCount} things are still missing.`;
      leadSub.textContent = 'Nothing can be recorded on this auditor with your role.';
    } else {
      leadText.textContent = 'Active in the register. Auditor is qualified and can be assigned to audits.';
      leadSub.textContent = 'Evaluation and surveillance status up to date.';
    }
  }

  // Populate Missing Section
  const missingCountEl = document.getElementById('auditor-missing-count-text');
  if (missingCountEl) {
    missingCountEl.textContent = auditor.missingCount > 0 
      ? `${auditor.missingCount} of ${auditor.missingCount} items. Each one says what it holds up.`
      : '0 items missing. All registration requirements satisfied.';
  }

  const checklistContainer = document.getElementById('auditor-missing-checklist-container');
  if (checklistContainer) {
    if (auditor.missingItems.length > 0) {
      checklistContainer.innerHTML = auditor.missingItems.map((group, idx) => `
        <div class="auditor-group-tag" style="${idx > 0 ? 'margin-top: 1.75rem;' : ''}">${group.group}</div>
        <div class="auditor-missing-list">
          ${group.items.map(item => `
            <div class="auditor-missing-item">
              <span class="material-symbols-outlined auditor-missing-icon">warning</span>
              <div class="auditor-missing-content">
                <div class="auditor-missing-title">${item.title}</div>
                <div class="auditor-missing-desc">${item.desc}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `).join('');
    } else {
      checklistContainer.innerHTML = `
        <div style="padding: 1.5rem; background: rgba(34, 197, 94, 0.08); border: 1px solid rgba(34, 197, 94, 0.25); border-radius: 6px; color: #4ade80; margin-top: 1rem;">
          <div style="font-weight: 600; display: flex; align-items: center; gap: 8px;">
            <span class="material-symbols-outlined" style="font-size: 18px;">verified</span>
            All prerequisites met
          </div>
          <p style="font-size: 12.5px; color: var(--text-secondary); margin: 6px 0 0 0;">
            Agreement, certificates, and code of conduct are verified and active on file.
          </p>
        </div>
      `;
    }
  }

  const sourceNote = document.getElementById('auditor-source-note');
  if (sourceNote) sourceNote.textContent = auditor.sourceNote;

  // Populate Right Side Panels
  const compSide = document.getElementById('auditor-side-comp');
  if (compSide) compSide.textContent = auditor.competence;

  const assignSide = document.getElementById('auditor-side-assign');
  if (assignSide) assignSide.textContent = auditor.assignments;

  const holdEl = document.getElementById('auditor-side-hold');
  const tiesEl = document.getElementById('auditor-side-ties');
  const chainsEl = document.getElementById('auditor-side-chains');
  if (holdEl) holdEl.textContent = auditor.restrictions.hold;
  if (tiesEl) tiesEl.textContent = auditor.restrictions.ties;
  if (chainsEl) chainsEl.textContent = auditor.restrictions.chains;

  // Tab Pills
  const pPill = document.getElementById('auditor-prices-pill');
  const cPill = document.getElementById('auditor-comp-pill');
  const dPill = document.getElementById('auditor-docs-pill');
  const hPill = document.getElementById('auditor-hist-pill');
  if (pPill) pPill.textContent = auditor.counts.prices;
  if (cPill) cPill.textContent = auditor.counts.competence;
  if (dPill) dPill.textContent = auditor.counts.documents;
  if (hPill) hPill.textContent = auditor.counts.history;

  // Tab 2: Prices Pane
  const pricesDesc = document.getElementById('auditor-prices-desc');
  if (pricesDesc) pricesDesc.textContent = auditor.prices.desc;
  const vatVal = document.getElementById('auditor-vat-val');
  if (vatVal) vatVal.textContent = auditor.prices.vat;
  const vatSub = document.getElementById('auditor-vat-sub');
  if (vatSub) vatSub.textContent = auditor.prices.vatSub;

  // Tab 3: Competence Pane
  const compDesc = document.getElementById('auditor-comp-desc');
  if (compDesc) compDesc.textContent = auditor.competence;
  const workAreaVal = document.getElementById('auditor-workarea-val');
  if (workAreaVal) workAreaVal.textContent = auditor.workArea;
  const compHold = document.getElementById('auditor-comp-hold');
  if (compHold) compHold.textContent = auditor.restrictions.hold;
  const compTies = document.getElementById('auditor-comp-ties');
  if (compTies) compTies.textContent = auditor.restrictions.ties;
  const compChains = document.getElementById('auditor-comp-chains');
  if (compChains) compChains.textContent = auditor.restrictions.chains;

  // Tab 4: Documents Pane
  const signedDocsText = document.getElementById('auditor-signed-docs-text');
  if (signedDocsText) {
    signedDocsText.textContent = auditor.signedDocuments || 'No document has been recorded.';
  }

  const cameFromTbody = document.getElementById('auditor-camefrom-body');
  if (cameFromTbody) {
    const cf = auditor.whereCameFrom || {
      list: 'GR auditors (Data, 28 Sept 2026)',
      country: auditor.country,
      delivered: '28 Sep 2026',
      company: 'Q-CERT'
    };
    cameFromTbody.innerHTML = `
      <tr>
        <td>${cf.list}</td>
        <td>${cf.country}</td>
        <td>${cf.delivered}</td>
        <td>${cf.company}</td>
      </tr>
    `;
  }

  // Tab 5: History Pane
  const histRow = document.getElementById('auditor-history-row');
  if (histRow) {
    const h = (auditor.historyEntries && auditor.historyEntries[0]) || {
      date: '5 Oct 2026 20:42',
      action: 'Recorded',
      actor: 'The scheduler'
    };
    histRow.innerHTML = `
      <span>${h.date}</span>
      <span>${h.action}</span>
      <span>${h.actor}</span>
    `;
  }

  const histAssign = document.getElementById('auditor-history-assignments');
  if (histAssign) {
    histAssign.textContent = auditor.assignmentsDetail || 'This auditor has not been assigned to a dossier.';
  }

  // Switch to Overview Tab by default
  switchAuditorTab('overview');

  document.title = `Audit Independer — ${auditor.name}`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function switchAuditorTab(tabKey) {
  const tabs = ['overview', 'prices', 'competence', 'documents', 'history'];

  tabs.forEach(t => {
    const btn = document.getElementById(`tab-auditor-${t}`);
    const pane = document.getElementById(`pane-auditor-${t}`);
    if (btn) btn.classList.remove('active');
    if (pane) pane.classList.add('hidden');
  });

  const activeBtn = document.getElementById(`tab-auditor-${tabKey}`);
  const activePane = document.getElementById(`pane-auditor-${tabKey}`);
  if (activeBtn) activeBtn.classList.add('active');
  if (activePane) activePane.classList.remove('hidden');
}

// ─── View Functions ───

function showPlannedAssessmentsList() {
  hideAllViews();
  const el = document.getElementById('planned-assessments-list-view');
  if (el) el.classList.remove('hidden');

  updateSubNav('planned');
  document.title = 'Audit Independer — Planned assessments';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showPlannedAssessmentDetail(ref) {
  hideAllViews();
  const el = document.getElementById('planned-assessment-detail-view');
  if (el) el.classList.remove('hidden');

  updateSubNav('planned');
  document.title = 'Audit Independer — Surveillance — Amrâth Berghotel Amersfoort';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showComplaintsList() {
  hideAllViews();
  const el = document.getElementById('complaints-list-view');
  if (el) el.classList.remove('hidden');

  updateSubNav('complaints');
  document.title = 'Audit Independer — Complaints and appeals';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 1. Worklist View
function showWorklist() {
  hideAllViews();
  const el = document.getElementById('worklist-view');
  if (el) el.classList.remove('hidden');

  updateSubNav('worklist');
  document.title = 'Audit Independer — Worklist';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 2. Dossiers List View
function showDossiersList() {
  hideAllViews();
  const el = document.getElementById('dossiers-list-view');
  if (el) el.classList.remove('hidden');

  updateSubNav('dossiers');
  document.title = 'Audit Independer — Dossiers';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  applyDossiersFilters();
}

// 3. Establishments List View
function showEstablishmentsList() {
  hideAllViews();
  const el = document.getElementById('establishments-list-view');
  if (el) el.classList.remove('hidden');

  updateSubNav('establishments');
  document.title = 'Audit Independer — Establishments';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  renderEstablishmentsTable();
}

// 4. Establishment Detail View
function showEstablishmentDetail(ref) {
  currentActiveEstablishment = EST_MAP[ref] || ALL_ESTABLISHMENTS[0];
  hideAllViews();

  const el = document.getElementById('establishment-detail-view');
  if (el) el.classList.remove('hidden');

  updateSubNav('establishments');
  document.title = `Audit Independer — ${currentActiveEstablishment.name}`;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Update Header
  document.getElementById('est-detail-name').textContent = currentActiveEstablishment.name;
  document.getElementById('est-detail-gkid').textContent = currentActiveEstablishment.reference;
  document.getElementById('est-detail-country').textContent = currentActiveEstablishment.countryFull;
  document.getElementById('est-detail-category-type').textContent = currentActiveEstablishment.categoryType;
  document.getElementById('est-detail-no').textContent = currentActiveEstablishment.nationalOperator;
  document.getElementById('est-detail-status-badge').textContent = currentActiveEstablishment.status;

  // Update Certificate card
  const expiresEl = document.getElementById('est-cert-expires');
  if (expiresEl) expiresEl.textContent = currentActiveEstablishment.expiry;

  // Update Dossier info in Overview
  const btnOpenDossier = document.getElementById('btn-open-dossier-main');
  if (btnOpenDossier) {
    btnOpenDossier.textContent = `Open dossier ${currentActiveEstablishment.dossierNumber}`;
  }

  const dNum = document.getElementById('est-overview-dossier-num');
  if (dNum) dNum.textContent = currentActiveEstablishment.dossierNumber;

  const dTabNum = document.getElementById('est-dossiers-tab-num');
  if (dTabNum) dTabNum.textContent = currentActiveEstablishment.dossierNumber;

  // Populate Details Tab
  renderEstablishmentDetailsTab(currentActiveEstablishment);

  // Default to overview tab
  switchEstTab('overview');
}

function switchEstTab(tabName) {
  const tabs = ['overview', 'dossiers', 'details', 'history'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-est-btn-${t}`);
    const pane = document.getElementById(`est-pane-${t}`);
    if (btn) btn.classList.toggle('active', t === tabName);
    if (pane) pane.classList.toggle('hidden', t !== tabName);
  });
}

function renderEstablishmentDetailsTab(est) {
  const tbody = document.getElementById('est-details-table-body');
  if (!tbody) return;

  const detailsList = est.details || ALL_ESTABLISHMENTS[0].details;
  tbody.innerHTML = detailsList.map(item => `
    <tr>
      <td style="font-weight: 500; color: #fff;">${item.field}</td>
      <td style="color: var(--text-primary);">${item.value}</td>
      <td style="color: var(--text-muted); font-size: 11.5px;">${item.source}</td>
      <td style="color: var(--text-muted); font-size: 11.5px;" class="mono">${item.since}</td>
    </tr>
  `).join('');
}

function openDossierFromEst() {
  if (currentActiveEstablishment) {
    showDossier(currentActiveEstablishment.dossierNumber, 'establishment');
  } else {
    showDossier('A-2026-00014', 'establishment');
  }
}

// 5. Dossier Detail View
function showDossier(dossierId, origin = 'dossiers') {
  currentOriginView = origin;
  hideAllViews();

  const dossierView = document.getElementById('dossier-view');
  if (dossierView) dossierView.classList.remove('hidden');

  const dossier = DOSSIER_MAP[dossierId] || DOSSIER_MAP['A-2025-00004'];

  // Update Back button text based on origin
  const backBtnText = document.getElementById('dossier-back-btn-text');
  if (backBtnText) {
    if (origin === 'worklist') {
      backBtnText.textContent = 'Back to Worklist';
    } else if (origin === 'establishment') {
      backBtnText.textContent = currentActiveEstablishment ? `Back to ${currentActiveEstablishment.name}` : 'Back to Establishment';
    } else {
      backBtnText.textContent = 'Back to Dossiers';
    }
  }

  // Populate Dossier Header & Metadata
  const titleEl = document.getElementById('dossier-display-title');
  if (titleEl) {
    titleEl.textContent = `${dossier.gkId} — ${dossier.name}`;
  }

  const numberEl = document.getElementById('dossier-number-val');
  if (numberEl) {
    numberEl.textContent = dossier.number;
  }

  const stateEl = document.getElementById('dossier-state-val');
  if (stateEl) {
    stateEl.textContent = dossier.state;
  }

  document.title = `Audit Independer — ${dossier.gkId}`;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Default to the first tab (Actueel & Besluit)
  switchDossierTab('current');

  // Render dynamic 8-step pipeline stepper
  renderDossierStepper(dossier);

  // Render role-aware action buttons
  renderDossierActions();
}

function navigateBackFromDossier() {
  if (currentOriginView === 'worklist') {
    showWorklist();
  } else if (currentOriginView === 'establishment' && currentActiveEstablishment) {
    showEstablishmentDetail(currentActiveEstablishment.reference);
  } else if (currentOriginView === 'sentback') {
    showWatchSentBack();
  } else if (currentOriginView === 'watch') {
    showWatchOfficeOverview();
  } else {
    showDossiersList();
  }
}

function navigateBackFromEstablishment() {
  if (currentOriginView === 'watch') {
    showWatchOfficeOverview();
  } else {
    showEstablishmentsList();
  }
}

// ─── Establishments List: Table Rendering & Search ───

function renderEstablishmentsTable() {
  const query = document.getElementById('est-search-input')?.value.toLowerCase().trim() || '';
  const tbody = document.getElementById('establishments-table-body');
  if (!tbody) return;

  const filtered = ALL_ESTABLISHMENTS.filter(e => {
    if (!query) return true;
    const matchString = `${e.reference} ${e.name} ${e.country} ${e.nationalOperator}`.toLowerCase();
    return matchString.includes(query);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
          No establishments found.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(item => `
    <tr class="clickable-row" onclick="showEstablishmentDetail('${item.reference}')">
      <td class="col-dossier-id mono">${item.reference}</td>
      <td>
        <div class="est-name">${item.name}</div>
      </td>
      <td style="color: var(--text-secondary); font-weight: 500;">${item.country}</td>
      <td style="color: var(--text-secondary); max-width: 320px;">${item.nationalOperator}</td>
      <td>
        ${item.categories.map(c => `<span class="cat-pill">${c}</span>`).join(' ')}
      </td>
      <td>
        <div style="font-size: 13px; color: #fff;">${item.expiry}</div>
        ${item.expirySub ? `<div style="font-size: 11px; color: var(--text-muted);">${item.expirySub}</div>` : ''}
      </td>
      <td class="open-btn-cell">
        <button class="open-row-btn" onclick="event.stopPropagation(); showEstablishmentDetail('${item.reference}')">
          <span class="material-symbols-outlined">visibility</span> Open
        </button>
      </td>
    </tr>
  `).join('');
}

function applyEstablishmentsSearch() {
  renderEstablishmentsTable();
}

// ─── Dossiers Page: Open vs Closed Tab & Filters ───

function toggleDossiersStateTab(tab) {
  currentDossiersTab = tab;

  const btnOpen = document.getElementById('btn-dossiers-open');
  const btnClosed = document.getElementById('btn-dossiers-closed');

  if (tab === 'open') {
    if (btnOpen) btnOpen.classList.add('active');
    if (btnClosed) btnClosed.classList.remove('active');
  } else {
    if (btnOpen) btnOpen.classList.remove('active');
    if (btnClosed) btnClosed.classList.add('active');
  }

  applyDossiersFilters();
}

function applyDossiersFilters() {
  const stateVal = document.getElementById('dossier-filter-state')?.value || 'all';
  const waitingVal = document.getElementById('dossier-filter-waiting')?.value || 'all';
  const deadlineVal = document.getElementById('dossier-filter-deadline')?.value || 'all';
  const typeVal = document.getElementById('dossier-filter-type')?.value || 'all';
  const countryVal = document.getElementById('dossier-filter-country')?.value || 'all';
  const query = document.getElementById('dossiers-search-input')?.value.toLowerCase().trim() || '';

  const tbody = document.getElementById('dossiers-table-body');
  if (!tbody) return;

  const filtered = ALL_DOSSIERS.filter(item => {
    if (item.statusGroup !== currentDossiersTab) return false;
    if (stateVal !== 'all' && item.state !== stateVal) return false;
    if (waitingVal !== 'all' && !item.waitingOn.includes(waitingVal)) return false;
    if (deadlineVal !== 'all' && item.deadlineType !== deadlineVal) return false;
    if (typeVal !== 'all' && item.type !== typeVal) return false;
    if (countryVal !== 'all' && item.country !== countryVal) return false;
    if (query !== '') {
      const matchString = `${item.number} ${item.gkId} ${item.name} ${item.country}`.toLowerCase();
      if (!matchString.includes(query)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
          No dossiers match your selected filters.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    let stateBadgeClass = 'surveillance';
    if (item.state === 'In review') stateBadgeClass = 'review';
    else if (item.state === 'Suspended') stateBadgeClass = 'suspended';
    else if (item.state === 'Certified') stateBadgeClass = 'certified';
    else if (item.state === 'Refused') stateBadgeClass = 'refused';

    const deadlineIsOverdue = item.deadlineType === 'overdue';

    return `
      <tr class="clickable-row" onclick="showDossier('${item.number}', 'dossiers')">
        <td class="col-dossier-id">${item.number}</td>
        <td class="col-gkid">${item.gkId}</td>
        <td>
          <div class="est-name">${item.name}</div>
          <div class="est-country">${item.country}</div>
        </td>
        <td style="color:var(--text-secondary);">${item.type}</td>
        <td>
          <span class="status-badge ${stateBadgeClass}">${item.state}</span>
        </td>
        <td class="waiting-cell">
          <div class="waiting-title">${item.waitingOn}</div>
          <div class="waiting-detail">${item.waitingDetail}</div>
        </td>
        <td>
          <div class="deadline-title ${deadlineIsOverdue ? 'overdue' : ''}">${item.deadlineTitle}</div>
          <div class="deadline-sub">${item.deadlineSub}</div>
        </td>
        <td class="open-btn-cell">
          <button class="open-row-btn" onclick="event.stopPropagation(); showDossier('${item.number}', 'dossiers')">
            <span class="material-symbols-outlined">visibility</span> Open
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function resetDossierFilters() {
  const selects = [
    'dossier-filter-state',
    'dossier-filter-waiting',
    'dossier-filter-deadline',
    'dossier-filter-type',
    'dossier-filter-country'
  ];

  selects.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = 'all';
  });

  const searchInput = document.getElementById('dossiers-search-input');
  if (searchInput) searchInput.value = '';

  applyDossiersFilters();
}

// ─── Dossier Detail View: Tab Switching & Accordions ───

function switchDossierTab(tabKey) {
  const tabButtons = document.querySelectorAll('.dossier-tab-btn');
  tabButtons.forEach(btn => {
    if (btn.dataset.dossierTab === tabKey) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const panes = {
    current: document.getElementById('pane-current'),
    gates: document.getElementById('pane-gates'),
    audit: document.getElementById('pane-audit'),
    history: document.getElementById('pane-history')
  };

  if (tabKey === 'all') {
    Object.values(panes).forEach(pane => {
      if (pane) pane.classList.remove('hidden');
    });
  } else {
    Object.keys(panes).forEach(key => {
      if (panes[key]) {
        if (key === tabKey) {
          panes[key].classList.remove('hidden');
        } else {
          panes[key].classList.add('hidden');
        }
      }
    });
  }
}

function toggleCard(cardId) {
  const card = document.getElementById(cardId);
  if (card) {
    card.classList.toggle('collapsed');
  }
}

function toggleAllCards(expand) {
  const cards = document.querySelectorAll('.dossier-card');
  cards.forEach(card => {
    if (expand) {
      card.classList.remove('collapsed');
    } else {
      card.classList.add('collapsed');
    }
  });
}

function filterGateChecks(status) {
  const buttons = document.querySelectorAll('.gate-filter-btn');
  buttons.forEach(btn => {
    if (btn.dataset.gateFilter === status) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const items = document.querySelectorAll('.gate-check-item');
  items.forEach(item => {
    if (status === 'all' || item.dataset.gateStatus === status) {
      item.style.display = '';
    } else {
      item.style.display = 'none';
    }
  });
}

function toggleGateDetail(headerEl) {
  const item = headerEl.closest('.gate-check-item');
  if (item) {
    const body = item.querySelector('.gate-item-body');
    const icon = headerEl.querySelector('.material-symbols-outlined');
    if (body) {
      if (body.style.display === 'none') {
        body.style.display = 'block';
        if (icon) icon.textContent = 'expand_less';
      } else {
        body.style.display = 'none';
        if (icon) icon.textContent = 'expand_more';
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// DYNAMIC DOSSIER STEPPER & PIPELINE VISUALIZATION
// ═══════════════════════════════════════════════════════════════════════

const STEPPER_STAGES = [
  { step: 1, name: 'Aanvraag', nameEN: 'Application', desc: 'Pre-screening & dossier initialisatie' },
  { step: 2, name: 'Auditor', nameEN: 'Auditor', desc: 'Auditor toewijzing & acceptatie' },
  { step: 3, name: 'Facturatie', nameEN: 'Assessment', desc: 'Commissieprijs & betaling auditfee' },
  { step: 4, name: 'Audit', nameEN: 'Audit', desc: 'Audit uitvoering & rapport' },
  { step: 5, name: 'Review', nameEN: 'Review', desc: '4-ogen beoordeling & verificatie' },
  { step: 6, name: 'Besluit', nameEN: 'Decision', desc: 'Certificeringsbesluit (Grant / Conditional)' },
  { step: 7, name: 'Inform NO', nameEN: 'Inform NO', desc: 'Nationale Operator notificatie' },
  { step: 8, name: 'Certificaat', nameEN: 'Certificate', desc: 'Actief certificaat & surveillance' }
];

function renderDossierStepper(dossier) {
  const stepperRow = document.getElementById('stepper-row');
  if (!stepperRow) return;

  const currentStep = dossier.step || 1;
  let html = '';

  STEPPER_STAGES.forEach((stage, idx) => {
    let nodeClass = 'step-node';
    let stateLabel = 'later';
    let circleContent = stage.step;

    if (stage.step < currentStep) {
      nodeClass += ' completed';
      stateLabel = 'done';
      circleContent = '<span class="material-symbols-outlined" style="font-size:14px;font-weight:700;">check</span>';
    } else if (stage.step === currentStep) {
      nodeClass += ' current active';
      stateLabel = 'now';
    } else {
      nodeClass += ' upcoming';
      stateLabel = 'later';
    }

    html += `
      <div class="${nodeClass}" title="${stage.name}: ${stage.desc}" onclick="highlightStepperMilestone(${stage.step})">
        <div class="step-circle">${circleContent}</div>
        <div class="step-name">${stage.name}</div>
        <div class="step-state">${stateLabel}</div>
      </div>
    `;

    if (idx < STEPPER_STAGES.length - 1) {
      const lineClass = (stage.step < currentStep) ? 'step-line completed' : 'step-line';
      html += `<div class="${lineClass}"></div>`;
    }
  });

  stepperRow.innerHTML = html;

  // Update callout text dynamically based on state
  const calloutTitle = document.getElementById('stepper-callout-title');
  const calloutText = document.getElementById('stepper-callout-text');

  const CALLOUT_MESSAGES = {
    'Application': {
      title: 'In aanvraagfase',
      text: 'Het dossier is geregistreerd. Coördinator dient de pre-screening te starten.'
    },
    'Pre-screening': {
      title: 'In pre-screening',
      text: 'Stamdata en vestigingscriteria worden gecontroleerd door de Coördinator. Toewijzer kan hierna een auditor selecteren.'
    },
    'Auditor proposed': {
      title: 'Auditor voorgesteld',
      text: 'Toewijzer heeft een auditor voorgesteld. In afwachting van acceptatie door de vestiging.'
    },
    'Accepted by establishment': {
      title: 'Aanvaard door vestiging',
      text: 'Vestiging heeft de auditor geaccepteerd. Coördinator kan commissieprijs vaststellen en auditkosten factureren.'
    },
    'Invoiced': {
      title: 'Gefactureerd',
      text: 'Factuur voor auditfee is verzonden. In afwachting van boekhoudkundige betalingsregistratie (B-054 valuta check).'
    },
    'Paid': {
      title: 'Betaling geregistreerd',
      text: 'Auditkosten zijn voldaan. De audit kan worden ingepland en gestart door de Coördinator.'
    },
    'In audit': {
      title: 'Audit in uitvoering',
      text: 'De auditor voert de auditsessie uit op locatie en stelt het concept auditrapport op.'
    },
    'In review': {
      title: 'In beoordeling (4-ogen)',
      text: 'Auditrapport is ingediend. Beoordelaar verifieert de poortcontroles, criteria en stelt het conceptbesluit op.'
    },
    'In decision': {
      title: 'In formele besluitvorming',
      text: 'Beoordelaar neemt het formele certificaatbesluit (Verlenen, Onder voorbehoud of Weigeren).'
    },
    'Certified': {
      title: 'Certificaat toegekend!',
      text: 'Dossier is succesvol gecertificeerd. Coördinator informeert de Nationale Operator.'
    },
    'Under surveillance': {
      title: 'With the National Operator',
      text: 'Has the certificate. The file is under surveillance in standard 3-year certification cycle.'
    }
  };

  const msg = CALLOUT_MESSAGES[dossier.state] || {
    title: dossier.state,
    text: `Huidige status van dossier ${dossier.number} is ${dossier.state}.`
  };

  if (calloutTitle) calloutTitle.textContent = msg.title;
  if (calloutText) calloutText.textContent = msg.text;
}

function highlightStepperMilestone(step) {
  const stage = STEPPER_STAGES.find(s => s.step === step);
  if (stage) {
    showToast(`Mijlpaal ${step}: ${stage.name}`, stage.desc, 'info');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SPOTLIGHT COMMAND PALETTE (⌘K)
// ═══════════════════════════════════════════════════════════════════════

let spotlightSelectedIndex = 0;
let currentSpotlightResults = [];

function openCommandPalette() {
  const overlay = document.getElementById('spotlight-overlay');
  const input = document.getElementById('spotlight-input');
  if (!overlay || !input) return;

  overlay.classList.add('visible');
  input.value = '';
  spotlightSelectedIndex = 0;
  handleSpotlightInput();
  setTimeout(() => input.focus(), 50);
}

function closeCommandPalette() {
  const overlay = document.getElementById('spotlight-overlay');
  if (overlay) overlay.classList.remove('visible');
}

function handleSpotlightInput() {
  const input = document.getElementById('spotlight-input');
  const resultsContainer = document.getElementById('spotlight-results');
  if (!input || !resultsContainer) return;

  const q = input.value.toLowerCase().trim();
  const items = [];

  // 1. Quick Actions
  const quickActions = [
    {
      title: 'Wissel rol naar Coördinator',
      subtitle: 'Beheert dossiers, facturering en stamdata',
      icon: 'admin_panel_settings',
      action: () => { RBAC.setRole('coordinator'); closeCommandPalette(); showToast('Rol gewijzigd', 'Ingelogd als Coördinator', 'info'); }
    },
    {
      title: 'Wissel rol naar Toewijzer',
      subtitle: 'Wijst auditors toe aan dossiers',
      icon: 'assignment_ind',
      action: () => { RBAC.setRole('assigner'); closeCommandPalette(); showToast('Rol gewijzigd', 'Ingelogd als Toewijzer', 'info'); }
    },
    {
      title: 'Wissel rol naar Beoordelaar',
      subtitle: 'Beoordeelt rapporten en neemt besluiten',
      icon: 'gavel',
      action: () => { RBAC.setRole('reviewer'); closeCommandPalette(); showToast('Rol gewijzigd', 'Ingelogd als Beoordelaar', 'info'); }
    },
    {
      title: 'Wissel Light / Dark mode',
      subtitle: 'Schakel tussen donkere en lichte weergave',
      icon: 'palette',
      action: () => { toggleTheme(); closeCommandPalette(); }
    },
    {
      title: 'Health and safety: points of attention',
      subtitle: 'Beheer van de 6 criteria met bijzondere aandacht bij N.v.t. (Gate check 8)',
      icon: 'health_and_safety',
      action: () => { closeCommandPalette(); showSettingsNav(); showSettingsHealthSafety(); }
    },
    {
      title: 'Gebruikers en rollen (Users and roles)',
      subtitle: 'Beheer geautoriseerde medewerkers en ISO 17021 functiescheiding',
      icon: 'group',
      action: () => { closeCommandPalette(); showSettingsNav(); showSettingsUsersRoles(); }
    },
    {
      title: 'Werkdagenkalender (Working-day calendar)',
      subtitle: 'Overzicht van wettelijke feestdagen en bestuursbesluiten',
      icon: 'calendar_month',
      action: () => { closeCommandPalette(); showSettingsNav(); showSettingsWorkingDays(); }
    },
    {
      title: 'Systeemaannames (Assumptions)',
      subtitle: 'Bekijk de 15 bindende audit- en procesaannames',
      icon: 'fact_check',
      action: () => { closeCommandPalette(); showSettingsNav(); showSettingsAssumptions(); }
    },
    {
      title: 'Themabeheer (Themes)',
      subtitle: 'Stel het standaard visuele themaprofiel in (House style, Calm, Familiar)',
      icon: 'style',
      action: () => { closeCommandPalette(); showSettingsNav(); showSettingsThemes(); }
    },
    {
      title: 'Prijsregels beheren (Settings)',
      subtitle: 'Bekijk en bewerk Green Key tarieven per land',
      icon: 'payments',
      action: () => { closeCommandPalette(); showSettingsNav(); showSettingsPriceRules(); }
    },
    {
      title: 'Exporteer Worklist naar CSV',
      subtitle: 'Download alle openstaande taken als CSV',
      icon: 'download',
      action: () => { closeCommandPalette(); exportWorklistCSV(); }
    }
  ];

  quickActions.forEach(qa => {
    if (!q || qa.title.toLowerCase().includes(q) || qa.subtitle.toLowerCase().includes(q)) {
      items.push({
        type: 'action',
        category: 'Snelle Acties',
        icon: qa.icon,
        title: qa.title,
        subtitle: qa.subtitle,
        action: qa.action
      });
    }
  });

  // 2. Dossiers
  Object.values(DOSSIER_MAP).forEach(d => {
    if (!q || d.number.toLowerCase().includes(q) || d.gkId.toLowerCase().includes(q) || d.name.toLowerCase().includes(q) || d.state.toLowerCase().includes(q)) {
      items.push({
        type: 'dossier',
        category: 'Dossiers',
        icon: 'folder_open',
        title: `${d.number} — ${d.name}`,
        subtitle: `${d.gkId} · ${d.state} · ${d.country || 'NL'}`,
        action: () => { closeCommandPalette(); showDossier(d.number); }
      });
    }
  });

  // 3. Establishments
  ALL_ESTABLISHMENTS.forEach(est => {
    if (!q || est.reference.toLowerCase().includes(q) || est.name.toLowerCase().includes(q) || est.countryFull.toLowerCase().includes(q)) {
      items.push({
        type: 'establishment',
        category: 'Vestigingen',
        icon: 'apartment',
        title: `${est.reference} — ${est.name}`,
        subtitle: `${est.countryFull} · ${est.status}`,
        action: () => { closeCommandPalette(); showEstablishmentDetail(est.reference); }
      });
    }
  });

  // 4. Auditors
  ALL_AUDITORS.forEach(aud => {
    if (!q || aud.name.toLowerCase().includes(q) || aud.country.toLowerCase().includes(q)) {
      items.push({
        type: 'auditor',
        category: 'Auditors',
        icon: 'badge',
        title: aud.name,
        subtitle: `${aud.country} · ${aud.status} · ${aud.qualificationsCount} kwalificaties`,
        action: () => { closeCommandPalette(); showAuditorDetail(aud.id); }
      });
    }
  });

  currentSpotlightResults = items.slice(0, 16);
  if (spotlightSelectedIndex >= currentSpotlightResults.length) {
    spotlightSelectedIndex = 0;
  }

  if (currentSpotlightResults.length === 0) {
    resultsContainer.innerHTML = `
      <div class="spotlight-empty">
        <span class="material-symbols-outlined" style="font-size:32px;color:var(--text-muted);">search_off</span>
        <p>Geen resultaten gevonden voor "${q}".</p>
      </div>
    `;
    return;
  }

  let html = '';
  let lastCategory = '';

  currentSpotlightResults.forEach((item, index) => {
    if (item.category !== lastCategory) {
      lastCategory = item.category;
      html += `<div class="spotlight-category-header">${item.category}</div>`;
    }

    const isSelected = index === spotlightSelectedIndex ? 'selected' : '';
    html += `
      <div class="spotlight-item ${isSelected}" onclick="executeSpotlightItem(${index})">
        <span class="material-symbols-outlined spotlight-item-icon">${item.icon}</span>
        <div class="spotlight-item-text">
          <div class="spotlight-item-title">${item.title}</div>
          <div class="spotlight-item-sub">${item.subtitle}</div>
        </div>
        <span class="material-symbols-outlined spotlight-enter-icon">subdirectory_arrow_left</span>
      </div>
    `;
  });

  resultsContainer.innerHTML = html;
}

function handleSpotlightKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (currentSpotlightResults.length > 0) {
      spotlightSelectedIndex = (spotlightSelectedIndex + 1) % currentSpotlightResults.length;
      handleSpotlightInput();
      scrollSelectedSpotlightIntoView();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (currentSpotlightResults.length > 0) {
      spotlightSelectedIndex = (spotlightSelectedIndex - 1 + currentSpotlightResults.length) % currentSpotlightResults.length;
      handleSpotlightInput();
      scrollSelectedSpotlightIntoView();
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    executeSpotlightItem(spotlightSelectedIndex);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeCommandPalette();
  }
}

function scrollSelectedSpotlightIntoView() {
  const selected = document.querySelector('.spotlight-item.selected');
  if (selected) {
    selected.scrollIntoView({ block: 'nearest' });
  }
}

function executeSpotlightItem(index) {
  const item = currentSpotlightResults[index];
  if (item && item.action) {
    item.action();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// NOTIFICATIONS POPOVER & SHORTCUTS MODAL
// ═══════════════════════════════════════════════════════════════════════

function toggleNotifications() {
  const popover = document.getElementById('notifications-popover');
  if (popover) {
    popover.classList.toggle('hidden');
  }
}

function markAllNotificationsRead() {
  const badge = document.getElementById('notif-pill-badge');
  if (badge) badge.style.display = 'none';
  showToast('Notificaties gelezen', 'Alle notificaties zijn als gelezen gemarkeerd.', 'success');
}

// Close notifications on outside click
document.addEventListener('click', (e) => {
  const wrapper = document.getElementById('notif-wrapper');
  const popover = document.getElementById('notifications-popover');
  if (wrapper && popover && !wrapper.contains(e.target) && !popover.classList.contains('hidden')) {
    popover.classList.add('hidden');
  }
});

function openShortcutsModal() {
  const modal = document.getElementById('shortcuts-modal-overlay');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('visible');
  }
}

function closeShortcutsModal() {
  const modal = document.getElementById('shortcuts-modal-overlay');
  if (modal) {
    modal.classList.remove('visible');
    modal.classList.add('hidden');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORT & PRINT FUNCTIONS (CSV & PDF)
// ═══════════════════════════════════════════════════════════════════════

function exportWorklistCSV() {
  const rows = [
    ['Dossier', 'Green Key ID', 'Establishment', 'Country', 'State', 'Deadline', 'Expected of me'],
    ['A-2025-00004', 'GK90011', 'Restaurant Vier Gangen', 'Germany', 'Under surveillance', '317 days overdue · 24 Nov 2025', 'Assess surveillance material and record approval'],
    ['A-2026-00001', 'GK90009', 'Bed en Ontbijt De Marge', 'Netherlands', 'In review', 'Tomorrow · 8 Oct 2026', 'Assess the dossier and write the draft decision'],
    ['A-2026-00003', 'GK90008', 'Park Inn by Radisson Linz', 'Austria', 'Paid', '15 Oct 2026', 'Schedule on-site assessment with auditor']
  ];

  downloadCSV(rows, 'Audit_Independer_Worklist.csv');
  showToast('Geëxporteerd', 'Worklist is succesvol gedownload als CSV.', 'success');
}

function exportDossiersCSV() {
  const rows = [
    ['Dossier Number', 'Green Key ID', 'Establishment Name', 'Country', 'Category', 'Status', 'Expiry Date'],
    ...ALL_ESTABLISHMENTS.map(e => [
      e.dossierNumber || 'N/A',
      e.reference,
      e.name,
      e.countryFull,
      e.categories.join('; '),
      e.status,
      e.expiry
    ])
  ];

  downloadCSV(rows, 'Audit_Independer_Dossiers.csv');
  showToast('Geëxporteerd', 'Dossiers zijn succesvol gedownload als CSV.', 'success');
}

function downloadCSV(rows, filename) {
  const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportDossierPDF() {
  window.print();
}

function copyDossierShareLink() {
  const url = window.location.href;
  navigator.clipboard.writeText(url).then(() => {
    showToast('Gekopieerd', 'Permanente link naar dossier is gekopieerd naar klembord.', 'success');
  }).catch(() => {
    showToast('Link', window.location.href, 'info');
  });
}

// ═══════════════════════════════════════════════════════════════════════
// QUICK PEEK SLIDE-OVER DRAWER (LINEAR / STRIPE STYLE)
// ═══════════════════════════════════════════════════════════════════════

let currentPeekDossierId = null;
const WORKLIST_DOSSIER_IDS = ALL_DOSSIERS.filter(d => d.statusGroup === 'open').map(d => d.number);

function openDossierPeek(dossierId) {
  currentPeekDossierId = dossierId;
  renderDossierPeek(dossierId);
  const backdrop = document.getElementById('peek-drawer-backdrop');
  const drawer = document.getElementById('peek-drawer');
  if (backdrop) backdrop.classList.add('visible');
  if (drawer) {
    drawer.classList.add('visible');
    // Ensure mousewheel anywhere inside drawer (including header/footer) scrolls the body
    if (!drawer._wheelForwarderAttached) {
      drawer._wheelForwarderAttached = true;
      drawer.addEventListener('wheel', (e) => {
        const bodyEl = drawer.querySelector('.peek-body');
        if (bodyEl && !bodyEl.contains(e.target)) {
          bodyEl.scrollTop += e.deltaY;
        }
      }, { passive: true });
    }
  }
  document.body.style.overflow = 'hidden';

  // Automatically focus scrollable body and reset scroll to top
  setTimeout(() => {
    const bodyEl = document.getElementById('peek-drawer-body');
    if (bodyEl) {
      bodyEl.scrollTop = 0;
      bodyEl.focus();
    }
  }, 30);
}
window.openDossierPeek = openDossierPeek;

function closeDossierPeek() {
  const backdrop = document.getElementById('peek-drawer-backdrop');
  const drawer = document.getElementById('peek-drawer');
  if (backdrop) backdrop.classList.remove('visible');
  if (drawer) drawer.classList.remove('visible');
  currentPeekDossierId = null;
  document.body.style.overflow = '';
}
window.closeDossierPeek = closeDossierPeek;

function navigatePeek(direction) {
  if (!currentPeekDossierId) return;
  const list = WORKLIST_DOSSIER_IDS;
  let idx = list.indexOf(currentPeekDossierId);
  if (idx === -1) idx = 0;
  let nextIdx = idx + direction;
  if (nextIdx >= 0 && nextIdx < list.length) {
    openDossierPeek(list[nextIdx]);
  }
}
window.navigatePeek = navigatePeek;

function renderDossierPeek(dossierId) {
  const container = document.getElementById('peek-drawer-content');
  if (!container) return;

  const dossier = DOSSIER_MAP[dossierId] || DOSSIER_MAP['A-2025-00004'];
  const list = WORKLIST_DOSSIER_IDS;
  const currentIdx = list.indexOf(dossier.number);
  const totalCount = list.length;
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx !== -1 && currentIdx < totalCount - 1;

  // Resolve active role
  const role = RBAC.getRole();
  const currentStep = dossier.step || 5;

  // Determine Next Best Action based on role & step
  let actionTitle = 'Volgende vereiste actie';
  let actionDesc = '';
  let actionBtnText = '';
  let actionBtnAction = '';
  let rolePillText = role.label;

  if (role.id === 'coordinator') {
    if (currentStep === 1) {
      actionTitle = 'Commissie beprijzen & factureren';
      actionDesc = 'De intake is voltooid. Beprijs de commissie en genereer de auditkostenfactuur voor de vestiging.';
      actionBtnText = 'Prijs de commissie';
      actionBtnAction = `openGateModal('price_commission', '${dossier.number}')`;
    } else if (currentStep === 3) {
      actionTitle = 'Auditkosten betaling registreren';
      actionDesc = 'De factuur is verstuurd. Bevestig de betaling van de auditkosten zodra de banktransactie binnen is.';
      actionBtnText = 'Registreer betaling';
      actionBtnAction = `openGateModal('register_payment', '${dossier.number}')`;
    } else if (currentStep >= 7) {
      actionTitle = 'Nationale Operator informeren';
      actionDesc = 'Het certificaat is toegekend. Informeer de Nationale Operator en rond het dossier administratief af.';
      actionBtnText = 'Informeer Nationale Operator';
      actionBtnAction = `openGateModal('national_operator_informed', '${dossier.number}')`;
    } else {
      actionTitle = 'Dossier monitoring';
      actionDesc = `Dossier bevindt zich in fase ${currentStep} (${dossier.waitingDetail || 'in behandeling'}). Wacht op audit/review afronding.`;
      actionBtnText = 'Bekijk dossierdetails';
      actionBtnAction = `showDossier('${dossier.number}', 'worklist'); closeDossierPeek();`;
    }
  } else if (role.id === 'assigner') {
    if (currentStep <= 3) {
      actionTitle = 'Auditor toewijzen';
      actionDesc = 'Wijs een gekwalificeerde auditor toe met geldige certificering voor categorie HH.';
      actionBtnText = 'Wijs auditor toe';
      actionBtnAction = `openGateModal('assign_auditor', '${dossier.number}')`;
    } else {
      actionTitle = 'Toewijzing voltooid';
      actionDesc = 'Auditor is reeds toegewezen. De audit is ingepland of uitgevoerd.';
      actionBtnText = 'Bekijk toewijzing';
      actionBtnAction = `showDossier('${dossier.number}', 'worklist'); closeDossierPeek();`;
    }
  } else if (role.id === 'reviewer') {
    if (currentStep >= 5) {
      actionTitle = 'Poortcontroles & Besluitvorming';
      actionDesc = 'Het auditrapport is ingediend. Beoordeel de 15 poortcontroles en autoriseer de certificering.';
      actionBtnText = 'Start poortcontrole (15 checks)';
      actionBtnAction = `openGateModal('gate_check_review', '${dossier.number}')`;
    } else {
      actionTitle = 'Audit nog niet afgerond';
      actionDesc = 'Wacht op voltooiing van het veldonderzoek en auditverslag door de auditor.';
      actionBtnText = 'Bekijk status';
      actionBtnAction = `showDossier('${dossier.number}', 'worklist'); closeDossierPeek();`;
    }
  }

  // 8 Pipeline Steps definition
  const stepsDef = [
    { num: 1, name: 'Intake' },
    { num: 2, name: 'Beprijzen' },
    { num: 3, name: 'Betaling' },
    { num: 4, name: 'Toewijzing' },
    { num: 5, name: 'Audit' },
    { num: 6, name: 'Review' },
    { num: 7, name: 'Besluit' },
    { num: 8, name: 'Certificaat' }
  ];

  const stepperHtml = stepsDef.map((s, idx) => {
    let stateClass = '';
    if (s.num < currentStep) stateClass = 'completed';
    else if (s.num === currentStep) stateClass = 'current';

    const connector = idx < stepsDef.length - 1 ? 
      `<div class="peek-step-connector ${s.num < currentStep ? 'completed' : ''}"></div>` : '';

    return `
      <div class="peek-step-dot ${stateClass}" title="${s.name} (${s.num})">${s.num < currentStep ? '✓' : s.num}</div>
      ${connector}
    `;
  }).join('');

  // Status badge class
  let statusBadgeClass = 'review';
  const stLower = (dossier.state || '').toLowerCase();
  if (stLower.includes('surveillance')) statusBadgeClass = 'surveillance';
  else if (stLower.includes('overdue')) statusBadgeClass = 'overdue';
  else if (stLower.includes('passed') || stLower.includes('cert')) statusBadgeClass = 'cert-granted';
  else if (stLower.includes('suspend')) statusBadgeClass = 'suspended';
  else if (stLower.includes('prescreen')) statusBadgeClass = 'prescreening';
  else if (stLower.includes('pricing') || stLower.includes('beprijs')) statusBadgeClass = 'pricing';
  else if (stLower.includes('payment') || stLower.includes('betaal') || stLower.includes('factuur')) statusBadgeClass = 'payment';
  else if (stLower.includes('assign') || stLower.includes('toewijs')) statusBadgeClass = 'assignment';
  else if (stLower.includes('audit')) statusBadgeClass = 'audit';
  else if (stLower.includes('decision') || stLower.includes('besluit')) statusBadgeClass = 'decision';
  else if (stLower.includes('corrective') || stLower.includes('cap')) statusBadgeClass = 'corrective';
  else if (stLower.includes('review')) statusBadgeClass = 'review';

  // Build full content
  container.innerHTML = `
    <div class="peek-drawer-inner">
      <!-- Drawer Header -->
      <div class="peek-header">
        <div class="peek-nav-bar">
          <div class="peek-nav-group">
            <button class="peek-nav-btn" onclick="navigatePeek(-1)" ${!hasPrev ? 'disabled' : ''} title="Vorige dossier (K of [)">
              <span class="material-symbols-outlined" style="font-size:16px;">chevron_left</span> Vorige
            </button>
            <span class="peek-counter">${currentIdx !== -1 ? currentIdx + 1 : 1} / ${totalCount}</span>
            <button class="peek-nav-btn" onclick="navigatePeek(1)" ${!hasNext ? 'disabled' : ''} title="Volgende dossier (J of ])">
              Volgende <span class="material-symbols-outlined" style="font-size:16px;">chevron_right</span>
            </button>
          </div>
          <button class="peek-close-btn" onclick="closeDossierPeek()" title="Sluit (Esc)">
            <span class="material-symbols-outlined" style="font-size:18px;">close</span>
          </button>
        </div>

        <div class="peek-title-row">
          <div>
            <div class="peek-dossier-id">
              <span>${dossier.number}</span>
              <span class="peek-gkid-badge">${dossier.gkId}</span>
            </div>
            <div class="peek-est-name">${dossier.name}</div>
            <div class="peek-est-meta">
              <span class="material-symbols-outlined" style="font-size:15px; color:var(--text-muted);">location_on</span>
              <span>${dossier.country || 'Nederland'}</span>
              <span>·</span>
              <span>Green Key Goud</span>
            </div>
          </div>
          <div>
            <span class="status-badge ${statusBadgeClass}">${dossier.state}</span>
          </div>
        </div>
      </div>

      <!-- Drawer Body -->
      <div class="peek-body" id="peek-drawer-body" tabindex="0" role="region" aria-label="Dossier Details Inhoud">
        <!-- Next Best Action Card -->
        <div class="peek-action-card">
          <div class="peek-action-header">
            <span class="peek-action-title">
              <span class="material-symbols-outlined" style="font-size:19px; color:#2563eb;">bolt</span>
              ${actionTitle}
            </span>
            <span class="peek-action-role-pill">${rolePillText}</span>
          </div>
          <div class="peek-action-desc">${actionDesc}</div>
          <button class="peek-action-cta-btn" onclick="${actionBtnAction}">
            <span class="material-symbols-outlined" style="font-size:17px;">task_alt</span>
            <span>${actionBtnText}</span>
          </button>
        </div>

        <!-- 8-Step Mini Pipeline Stepper -->
        <div class="peek-mini-stepper-wrap">
          <div class="peek-section-title">
            <span>Levenscyclus Voortgang</span>
            <span style="font-family:var(--font-mono); font-size:11px; color:#2563eb; font-weight:700;">Stap ${currentStep} van 8</span>
          </div>
          <div class="peek-mini-stepper">
            ${stepperHtml}
          </div>
          <div class="peek-step-label-row">
            <span class="material-symbols-outlined" style="font-size:16px; color:#2563eb;">arrow_right_alt</span>
            <span>Huidige fase: <strong>${stepsDef[currentStep - 1] ? stepsDef[currentStep - 1].name : 'In behandeling'}</strong></span>
          </div>
        </div>

        <!-- Key Parameters Grid -->
        <div class="peek-grid">
          <div class="peek-attr-card">
            <span class="peek-attr-label">Vervaldatum / SLA</span>
            <span class="peek-attr-val" style="${dossier.deadlineType === 'overdue' ? 'color:var(--status-overdue-text);' : ''}">
              ${dossier.deadlineTitle || 'Op schema'}
            </span>
          </div>

          <div class="peek-attr-card">
            <span class="peek-attr-label">Wacht op Actie</span>
            <span class="peek-attr-val">${dossier.waitingOn || 'Interne controle'}</span>
          </div>

          <div class="peek-attr-card">
            <span class="peek-attr-label">Type Aanvraag</span>
            <span class="peek-attr-val">${dossier.type || 'Eerste certificering'}</span>
          </div>

          <div class="peek-attr-card">
            <span class="peek-attr-label">Categorie & Route</span>
            <span class="peek-attr-val">${dossier.categories || 'HH'} (Standaardcyclus)</span>
          </div>

          <div class="peek-attr-card">
            <span class="peek-attr-label">Toegewezen Auditor</span>
            <span class="peek-attr-val">${currentStep >= 4 ? 'J. van Dam' : 'Nog niet toegewezen'}</span>
          </div>

          <div class="peek-attr-card">
            <span class="peek-attr-label">Factuur & Commissie</span>
            <span class="peek-attr-val">${currentStep >= 3 ? 'Betaald (€ 1.450)' : 'Openstaand'}</span>
          </div>
        </div>
      </div>

      <!-- Drawer Footer -->
      <div class="peek-footer">
        <button class="peek-footer-secondary" onclick="closeDossierPeek()">
          Sluiten
        </button>
        <button class="peek-footer-primary" onclick="showDossier('${dossier.number}', 'worklist'); closeDossierPeek();">
          <span>Open volledig dossier</span>
          <span class="material-symbols-outlined" style="font-size:17px;">arrow_forward</span>
        </button>
      </div>
    </div>
  `;
}
window.renderDossierPeek = renderDossierPeek;

// ─── Initial Page Load ───

document.addEventListener('DOMContentLoaded', () => {
  // Sync theme UI elements
  initTheme();

  // Initialize RBAC system
  RBAC.init();

  // Render tables
  applyDossiersFilters();
  renderEstablishmentsTable();
  renderAuditorsTable();
  renderRelationshipTable();
  renderDailySummaries();
  renderDeadlinesTable();
  renderImportRunsTable();

  // Worklist Filter Pills
  const filterPills = document.querySelectorAll('#worklist-filter-pills .filter-pill-btn');
  const rows = document.querySelectorAll('.dossier-item-row');
  const overdueHeader = document.querySelector('.section-overdue-header');
  const laterHeader = document.querySelector('.section-later-header');

  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      applyWorklistFilters();
    });
  });

  // Search and Checkboxes in Worklist
  const searchField = document.getElementById('worklist-search');
  if (searchField) {
    searchField.addEventListener('input', () => {
      applyWorklistFilters();
    });
  }
  const checkMe = document.getElementById('check-me');
  if (checkMe) checkMe.addEventListener('change', applyWorklistFilters);
  const checkOthers = document.getElementById('check-others');
  if (checkOthers) checkOthers.addEventListener('change', applyWorklistFilters);

  // Global Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const spotlight = document.getElementById('spotlight-overlay');
      if (spotlight && spotlight.classList.contains('visible')) {
        closeCommandPalette();
      } else {
        openCommandPalette();
      }
      return;
    }

    if (e.key === 'Escape') {
      const peekDrawer = document.getElementById('peek-drawer');
      if (peekDrawer && peekDrawer.classList.contains('visible')) {
        closeDossierPeek();
        return;
      }
      const bulkModal = document.getElementById('bulk-assign-modal');
      if (bulkModal && !bulkModal.classList.contains('hidden')) {
        closeBulkAssignModal();
        return;
      }
      if (typeof selectedDossierIds !== 'undefined' && selectedDossierIds.size > 0) {
        clearWorklistSelection();
        return;
      }
      closeCommandPalette();
      closeShortcutsModal();
      closeModal();
      const popover = document.getElementById('notifications-popover');
      if (popover) popover.classList.add('hidden');
      return;
    }

    // Drawer specific shortcuts when open
    const peekDrawer = document.getElementById('peek-drawer');
    const isPeekOpen = peekDrawer && peekDrawer.classList.contains('visible');
    if (isPeekOpen && !isInput) {
      const bodyEl = document.getElementById('peek-drawer-body') || (peekDrawer ? peekDrawer.querySelector('.peek-body') : null);

      // Dossier navigation: J, K, [, ], or Alt + Arrows
      if (e.key.toLowerCase() === 'j' || e.key === ']' || (e.altKey && e.key === 'ArrowDown')) {
        e.preventDefault();
        navigatePeek(1);
        return;
      }
      if (e.key.toLowerCase() === 'k' || e.key === '[' || (e.altKey && e.key === 'ArrowUp')) {
        e.preventDefault();
        navigatePeek(-1);
        return;
      }

      // Smooth keyboard scrolling inside drawer panel
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (bodyEl) bodyEl.scrollBy({ top: 70, behavior: 'smooth' });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (bodyEl) bodyEl.scrollBy({ top: -70, behavior: 'smooth' });
        return;
      }
      if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) {
        e.preventDefault();
        if (bodyEl) bodyEl.scrollBy({ top: 250, behavior: 'smooth' });
        return;
      }
      if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) {
        e.preventDefault();
        if (bodyEl) bodyEl.scrollBy({ top: -250, behavior: 'smooth' });
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        if (bodyEl) bodyEl.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        if (bodyEl) bodyEl.scrollTo({ top: bodyEl.scrollHeight, behavior: 'smooth' });
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (currentPeekDossierId) {
          showDossier(currentPeekDossierId, 'worklist');
          closeDossierPeek();
        }
        return;
      }
    }

    if (isInput) return;

    if (e.key === '?') {
      e.preventDefault();
      openShortcutsModal();
    } else if (e.key.toLowerCase() === 'w') {
      showWorkView();
    } else if (e.key.toLowerCase() === 'd') {
      showDossiersList();
    } else if (e.key.toLowerCase() === 'e') {
      showEstablishmentsList();
    } else if (e.key.toLowerCase() === 'a') {
      showAuditorsList();
    } else if (e.key.toLowerCase() === 'v') {
      toggleWorklistViewMode();
    } else if (e.key.toLowerCase() === 's') {
      showSettingsNav();
    } else if (e.key.toLowerCase() === 't') {
      toggleTheme();
    } else if (e.key.toLowerCase() === 'n') {
      toggleNotifications();
    }
  });

  function applyWorklistFilters() {
    if (currentWorklistViewMode === 'kanban') {
      renderKanbanBoard();
      return;
    }

    const activePill = document.querySelector('#worklist-filter-pills .filter-pill-btn.active');
    const filterType = activePill ? activePill.dataset.filter : 'all';
    const query = searchField ? searchField.value.toLowerCase().trim() : '';

    let visibleOverdue = 0;
    let visibleToday = 0;
    let visibleLater = 0;

    const rows = document.querySelectorAll('.dossier-item-row');
    const overdueHeader = document.querySelector('.section-overdue-header');
    const todayHeader = document.querySelector('.section-today-header');
    const laterHeader = document.querySelector('.section-later-header');

    rows.forEach(row => {
      const group = row.dataset.group;
      const rowText = row.textContent.toLowerCase();
      const matchesSearch = query === '' || rowText.includes(query);
      let matchesFilter = true;

      if (filterType === 'overdue') {
        matchesFilter = (group === 'overdue');
      } else if (filterType === 'today') {
        matchesFilter = (group === 'today');
      } else if (filterType === 'later') {
        matchesFilter = (group === 'later');
      }

      if (matchesSearch && matchesFilter) {
        row.style.display = '';
        if (group === 'overdue') visibleOverdue++;
        if (group === 'today') visibleToday++;
        if (group === 'later') visibleLater++;
      } else {
        row.style.display = 'none';
      }
    });

    if (overdueHeader) {
      overdueHeader.style.display = visibleOverdue > 0 ? '' : 'none';
    }
    if (todayHeader) {
      todayHeader.style.display = visibleToday > 0 ? '' : 'none';
    }
    if (laterHeader) {
      laterHeader.style.display = visibleLater > 0 ? '' : 'none';
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════
// WORKLIST PIPELINE KANBAN BOARD
// ═══════════════════════════════════════════════════════════════════════

const KANBAN_PHASES = [
  {
    id: 'phase-1',
    title: '1. Intake & Beprijzing',
    steps: [1, 2],
    stepRange: 'Stap 1 - 2',
    icon: 'fact_check',
    accent: '#2563eb',
    desc: 'Pre-screening & commissiebeprijzing'
  },
  {
    id: 'phase-2',
    title: '2. Betaling & Toewijzing',
    steps: [3, 4],
    stepRange: 'Stap 3 - 4',
    icon: 'payments',
    accent: '#7c3aed',
    desc: 'Facturatie & auditorplanning'
  },
  {
    id: 'phase-3',
    title: '3. Audit Uitvoering',
    steps: [5],
    stepRange: 'Stap 5',
    icon: 'assignment_turned_in',
    accent: '#d97706',
    desc: 'On-site inspectie & checklist'
  },
  {
    id: 'phase-4',
    title: '4. Kwaliteitsreview',
    steps: [6],
    stepRange: 'Stap 6',
    icon: 'rate_review',
    accent: '#e11d48',
    desc: 'Beoordeling & ontwerpbesluit'
  },
  {
    id: 'phase-5',
    title: '5. Besluit & Certificaat',
    steps: [7, 8],
    stepRange: 'Stap 7 - 8',
    icon: 'verified',
    accent: '#059669',
    desc: 'Toekenning & surveillance'
  }
];

let currentWorklistViewMode = 'table';

function setWorklistViewMode(mode) {
  currentWorklistViewMode = mode;
  const tableContainer = document.getElementById('worklist-table-container');
  const kanbanContainer = document.getElementById('worklist-kanban-container');
  const btnTable = document.getElementById('btn-view-table');
  const btnKanban = document.getElementById('btn-view-kanban');

  if (mode === 'kanban') {
    if (tableContainer) tableContainer.classList.add('hidden');
    if (kanbanContainer) {
      kanbanContainer.classList.remove('hidden');
      renderKanbanBoard();
    }
    if (btnTable) btnTable.classList.remove('active');
    if (btnKanban) btnKanban.classList.add('active');
  } else {
    if (kanbanContainer) kanbanContainer.classList.add('hidden');
    if (tableContainer) tableContainer.classList.remove('hidden');
    if (btnTable) btnTable.classList.add('active');
    if (btnKanban) btnKanban.classList.remove('active');
  }
}
window.setWorklistViewMode = setWorklistViewMode;

function toggleWorklistViewMode() {
  setWorklistViewMode(currentWorklistViewMode === 'table' ? 'kanban' : 'table');
}
window.toggleWorklistViewMode = toggleWorklistViewMode;

function renderKanbanBoard() {
  const container = document.getElementById('worklist-kanban-container');
  if (!container) return;

  const activePill = document.querySelector('#worklist-filter-pills .filter-pill-btn.active');
  const filterType = activePill ? activePill.dataset.filter : 'all';
  const searchInput = document.getElementById('worklist-search');
  const query = (searchInput && searchInput.value) ? searchInput.value.toLowerCase().trim() : '';

  const openDossiers = ALL_DOSSIERS.filter(d => d.statusGroup === 'open');

  const gridHtml = KANBAN_PHASES.map(phase => {
    const phaseDossiers = openDossiers.filter(d => {
      const step = d.step || 1;
      const inPhase = phase.steps.includes(step);
      if (!inPhase) return false;

      if (filterType === 'overdue' && d.deadlineType !== 'overdue') return false;
      if (filterType === 'today' && d.deadlineType !== 'today' && d.deadlineType !== 'tomorrow') return false;
      if (filterType === 'later' && d.deadlineType !== 'later') return false;

      if (query) {
        const fullText = `${d.number} ${d.gkId} ${d.name} ${d.country} ${d.waitingOn} ${d.state}`.toLowerCase();
        if (!fullText.includes(query)) return false;
      }
      return true;
    });

    const cardsHtml = phaseDossiers.map(d => {
      let slaClass = 'later';
      let slaText = d.deadlineTitle || 'Op schema';
      if (d.deadlineType === 'overdue') {
        slaClass = 'overdue';
      } else if (d.deadlineType === 'tomorrow' || d.deadlineType === 'today') {
        slaClass = 'tomorrow';
      }

      let assigneeName = d.waitingOn || 'Coördinator';
      let initials = 'CO';
      if (assigneeName.includes('Reviewer')) initials = 'RV';
      else if (assigneeName.includes('Auditor') || (d.step && d.step >= 4)) initials = 'JD';
      else if (assigneeName.includes('Closed')) initials = 'CL';

      return `
        <div class="kanban-card" 
             draggable="true" 
             data-dossier-id="${d.number}"
             data-phase-id="${phase.id}"
             ondragstart="handleKanbanDragStart(event)"
             ondragend="handleKanbanDragEnd(event)"
             onclick="openDossierPeek('${d.number}')">
          <div class="kanban-card-header">
            <div class="kanban-card-ids">
              <span class="kanban-card-id">${d.number}</span>
              <span class="kanban-card-gkid">${d.gkId}</span>
            </div>
            <span class="kanban-card-sla ${slaClass}">
              <span class="material-symbols-outlined" style="font-size:12px;">${slaClass === 'overdue' ? 'error' : 'schedule'}</span>
              <span>${slaText}</span>
            </span>
          </div>

          <div class="kanban-card-title">${d.name}</div>

          <div class="kanban-card-meta">
            <span class="kanban-card-badge">${d.country || 'Nederland'}</span>
            <span class="kanban-card-badge">${d.categories || 'HH'}</span>
            <span style="font-size:12px; color:var(--text-muted); font-family:var(--font-mono);">Stap ${d.step || 1}/8</span>
          </div>

          <div class="kanban-card-footer">
            <div class="kanban-card-assignee" title="Wacht op: ${d.waitingOn}">
              <div class="kanban-card-avatar">${initials}</div>
              <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;">${d.waitingOn}</span>
            </div>
            <div class="kanban-card-actions">
              <button class="kanban-btn-peek" onclick="event.stopPropagation(); openDossierPeek('${d.number}')" title="Quick Peek (Snel bekijken)">
                <span class="material-symbols-outlined" style="font-size:16px;">visibility</span>
              </button>
              <button class="kanban-btn-advance" onclick="event.stopPropagation(); advanceKanbanDossier('${d.number}', event)" title="Volgende stap (Bevorderen)">
                <span class="material-symbols-outlined" style="font-size:16px;">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const emptyHtml = phaseDossiers.length === 0 ? `
      <div class="kanban-empty-dropzone">
        <span class="material-symbols-outlined" style="font-size:26px; opacity:0.4;">inbox</span>
        <span>Geen dossiers in deze fase</span>
        <span style="font-size:11px; opacity:0.6;">Sleep een dossier hierheen</span>
      </div>
    ` : '';

    return `
      <div class="kanban-column" 
           id="kanban-col-${phase.id}"
           style="--col-accent: ${phase.accent};"
           ondragover="handleKanbanDragOver(event)"
           ondragleave="handleKanbanDragLeave(event)"
           ondrop="handleKanbanDrop(event, '${phase.id}')">
        <div class="kanban-col-header">
          <div class="kanban-col-top">
            <div class="kanban-col-title-wrap">
              <span class="material-symbols-outlined kanban-col-icon">${phase.icon}</span>
              <span class="kanban-col-title">${phase.title}</span>
            </div>
            <span class="kanban-col-count-badge">${phaseDossiers.length}</span>
          </div>
          <div class="kanban-col-subtitle">
            <span>${phase.desc}</span>
            <span class="kanban-col-step-tag">${phase.stepRange}</span>
          </div>
        </div>
        <div class="kanban-col-cards">
          ${cardsHtml}
          ${emptyHtml}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="kanban-board-grid">
      ${gridHtml}
    </div>
  `;
}
window.renderKanbanBoard = renderKanbanBoard;

let draggedDossierId = null;

function handleKanbanDragStart(event) {
  const card = event.target.closest('.kanban-card');
  if (!card) return;
  draggedDossierId = card.dataset.dossierId;
  card.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggedDossierId);
}
window.handleKanbanDragStart = handleKanbanDragStart;

function handleKanbanDragEnd(event) {
  const card = event.target.closest('.kanban-card');
  if (card) card.classList.remove('dragging');
  document.querySelectorAll('.kanban-column.drag-over').forEach(col => col.classList.remove('drag-over'));
}
window.handleKanbanDragEnd = handleKanbanDragEnd;

function handleKanbanDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const column = event.target.closest('.kanban-column');
  if (column && !column.classList.contains('drag-over')) {
    column.classList.add('drag-over');
  }
}
window.handleKanbanDragOver = handleKanbanDragOver;

function handleKanbanDragLeave(event) {
  const column = event.target.closest('.kanban-column');
  if (column && !column.contains(event.relatedTarget)) {
    column.classList.remove('drag-over');
  }
}
window.handleKanbanDragLeave = handleKanbanDragLeave;

function handleKanbanDrop(event, targetPhaseId) {
  event.preventDefault();
  const column = event.target.closest('.kanban-column');
  if (column) column.classList.remove('drag-over');

  const dossierId = event.dataTransfer.getData('text/plain') || draggedDossierId;
  if (!dossierId) return;

  const dossier = DOSSIER_MAP[dossierId];
  const targetPhase = KANBAN_PHASES.find(p => p.id === targetPhaseId);
  if (!dossier || !targetPhase) return;

  const newStep = targetPhase.steps[0];
  dossier.step = newStep;

  if (targetPhaseId === 'phase-1') {
    dossier.waitingOn = 'Us · Coordinator';
    dossier.state = 'Pre-screening';
  } else if (targetPhaseId === 'phase-2') {
    dossier.waitingOn = 'Us · Coordinator / Scheduler';
    dossier.state = 'Payment / Assignment';
  } else if (targetPhaseId === 'phase-3') {
    dossier.waitingOn = 'Auditor · J. van Dam';
    dossier.state = 'Audit in progress';
  } else if (targetPhaseId === 'phase-4') {
    dossier.waitingOn = 'Us · Reviewer';
    dossier.state = 'In review';
  } else if (targetPhaseId === 'phase-5') {
    dossier.waitingOn = 'Certification Body';
    dossier.state = 'Under surveillance';
  }

  showToast('Fase bijgewerkt', `Dossier ${dossierId} is verplaatst naar "${targetPhase.title}".`, 'success');
  renderKanbanBoard();
}
window.handleKanbanDrop = handleKanbanDrop;

function advanceKanbanDossier(dossierId, event) {
  if (event) event.stopPropagation();
  const dossier = DOSSIER_MAP[dossierId];
  if (!dossier) return;

  const currentStep = dossier.step || 1;
  if (currentStep >= 8) {
    showToast('Reeds voltooid', `Dossier ${dossierId} bevindt zich reeds in de afrondende fase.`, 'info');
    return;
  }

  dossier.step = currentStep + 1;
  const targetPhase = KANBAN_PHASES.find(p => p.steps.includes(dossier.step));
  const phaseName = targetPhase ? targetPhase.title : `Stap ${dossier.step}`;

  showToast('Fase gevorderd', `Dossier ${dossierId} is gevorderd naar Stap ${dossier.step} (${phaseName}).`, 'success');
  renderKanbanBoard();
}
window.advanceKanbanDossier = advanceKanbanDossier;

// ═══════════════════════════════════════════════════════════════════════
// WORKLIST BULK / BATCH ACTIONS CONTROLLER
// ═══════════════════════════════════════════════════════════════════════
const selectedDossierIds = new Set();
window.selectedDossierIds = selectedDossierIds;

function toggleRowSelection(dossierId, isChecked) {
  if (isChecked) {
    selectedDossierIds.add(dossierId);
  } else {
    selectedDossierIds.delete(dossierId);
  }

  // Update row visual highlight
  const checkbox = document.querySelector(`.worklist-row-checkbox[data-dossier-id="${dossierId}"]`);
  if (checkbox) {
    const row = checkbox.closest('tr');
    if (row) {
      if (isChecked) row.classList.add('selected');
      else row.classList.remove('selected');
    }
  }

  updateBulkActionsBar();
}
window.toggleRowSelection = toggleRowSelection;

function toggleSelectAllWorklist(isChecked) {
  const visibleRowCheckboxes = Array.from(document.querySelectorAll('.worklist-row-checkbox')).filter(cb => {
    const row = cb.closest('tr');
    return row && row.style.display !== 'none';
  });

  visibleRowCheckboxes.forEach(cb => {
    cb.checked = isChecked;
    const dossierId = cb.dataset.dossierId;
    const row = cb.closest('tr');

    if (isChecked) {
      if (dossierId) selectedDossierIds.add(dossierId);
      if (row) row.classList.add('selected');
    } else {
      if (dossierId) selectedDossierIds.delete(dossierId);
      if (row) row.classList.remove('selected');
    }
  });

  updateBulkActionsBar();
}
window.toggleSelectAllWorklist = toggleSelectAllWorklist;

function clearWorklistSelection() {
  selectedDossierIds.clear();

  document.querySelectorAll('.worklist-row-checkbox').forEach(cb => {
    cb.checked = false;
    const row = cb.closest('tr');
    if (row) row.classList.remove('selected');
  });

  const masterCheckbox = document.getElementById('worklist-select-all');
  if (masterCheckbox) {
    masterCheckbox.checked = false;
    masterCheckbox.indeterminate = false;
  }

  updateBulkActionsBar();
}
window.clearWorklistSelection = clearWorklistSelection;

function updateBulkActionsBar() {
  const count = selectedDossierIds.size;
  const bar = document.getElementById('bulk-actions-bar');
  const countPill = document.getElementById('bulk-selected-count');
  const label = document.getElementById('bulk-selected-label');
  const masterCheckbox = document.getElementById('worklist-select-all');

  if (bar) {
    if (count > 0) {
      bar.classList.add('visible');
    } else {
      bar.classList.remove('visible');
    }
  }

  if (countPill) {
    countPill.textContent = count;
  }

  if (label) {
    label.textContent = count === 1 ? 'dossier geselecteerd' : 'dossiers geselecteerd';
  }

  // Update master checkbox state (checked / indeterminate)
  if (masterCheckbox) {
    const visibleRowCheckboxes = Array.from(document.querySelectorAll('.worklist-row-checkbox')).filter(cb => {
      const row = cb.closest('tr');
      return row && row.style.display !== 'none';
    });

    if (visibleRowCheckboxes.length > 0) {
      const checkedVisibleCount = visibleRowCheckboxes.filter(cb => cb.checked).length;
      if (checkedVisibleCount === 0) {
        masterCheckbox.checked = false;
        masterCheckbox.indeterminate = false;
      } else if (checkedVisibleCount === visibleRowCheckboxes.length) {
        masterCheckbox.checked = true;
        masterCheckbox.indeterminate = false;
      } else {
        masterCheckbox.checked = false;
        masterCheckbox.indeterminate = true;
      }
    } else {
      masterCheckbox.checked = false;
      masterCheckbox.indeterminate = false;
    }
  }
}
window.updateBulkActionsBar = updateBulkActionsBar;

function executeBulkAction(actionType) {
  const count = selectedDossierIds.size;
  if (count === 0) {
    showToast('Geen selectie', 'Selecteer eerst minimaal 1 dossier om een actie uit te voeren.', 'warning');
    return;
  }

  if (actionType === 'reminder') {
    showToast('Herinneringen verstuurd', `Succesvol een batch-herinnering verstuurd naar ${count} vestigingen.`, 'success');
  } else if (actionType === 'advance') {
    let advancedCount = 0;
    selectedDossierIds.forEach(id => {
      const d = DOSSIER_MAP[id];
      if (d) {
        if (!d.step) d.step = 1;
        if (d.step < 8) {
          d.step += 1;
          advancedCount++;
        }
      }
    });

    showToast('Workflow gevorderd', `${advancedCount} geselecteerde dossiers zijn succesvol bevorderd naar de volgende fase.`, 'success');
    if (window.renderKanbanBoard) window.renderKanbanBoard();
    clearWorklistSelection();
  } else if (actionType === 'export') {
    // Generate CSV of selected dossiers
    const headers = ['Dossiernummer', 'Referentie', 'Naam', 'Land', 'Type', 'Status', 'Wacht op', 'Deadline'];
    const rows = [headers.join(',')];

    selectedDossierIds.forEach(id => {
      const d = DOSSIER_MAP[id] || {};
      const row = [
        `"${d.number || id}"`,
        `"${d.gkId || ''}"`,
        `"${(d.name || '').replace(/"/g, '""')}"`,
        `"${d.country || ''}"`,
        `"${d.type || ''}"`,
        `"${d.state || ''}"`,
        `"${d.waitingOn || ''}"`,
        `"${(d.deadlineTitle || '').replace(/"/g, '""')}"`
      ];
      rows.push(row.join(','));
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `independer_dossiers_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Export gedownload', `${count} dossiers geëxporteerd naar CSV.`, 'info');
  }
}
window.executeBulkAction = executeBulkAction;

function openBulkAssignModal() {
  const count = selectedDossierIds.size;
  if (count === 0) {
    showToast('Geen selectie', 'Selecteer eerst dossiers om een auditor toe te wijzen.', 'warning');
    return;
  }

  const countText = document.getElementById('bulk-assign-count-text');
  if (countText) {
    countText.textContent = `${count} geselecteerde ${count === 1 ? 'dossier' : 'dossiers'}`;
  }

  const modal = document.getElementById('bulk-assign-modal');
  if (modal) modal.classList.remove('hidden');
}
window.openBulkAssignModal = openBulkAssignModal;

function closeBulkAssignModal() {
  const modal = document.getElementById('bulk-assign-modal');
  if (modal) modal.classList.add('hidden');
}
window.closeBulkAssignModal = closeBulkAssignModal;

function confirmBulkAssign() {
  const auditorSelect = document.getElementById('bulk-assign-auditor-select');
  const selectedAuditor = auditorSelect ? auditorSelect.value : 'J. van Dam';
  const count = selectedDossierIds.size;

  selectedDossierIds.forEach(id => {
    const d = DOSSIER_MAP[id];
    if (d) {
      d.waitingOn = `Auditor · ${selectedAuditor}`;
      d.waitingDetail = 'auditor toegewezen voor inspectie';
      d.step = Math.max(d.step || 1, 4);
      d.state = 'Auditor toegewezen';
    }
  });

  closeBulkAssignModal();
  clearWorklistSelection();
  showToast('Auditor Toegewezen', `Auditor ${selectedAuditor} is toegewezen aan ${count} dossiers.`, 'success');
  if (window.renderKanbanBoard) window.renderKanbanBoard();
}
window.confirmBulkAssign = confirmBulkAssign;

// ═══════════════════════════════════════════════════════════════════════
// CALM / FOCUS MODE CONTROLLER
// ═══════════════════════════════════════════════════════════════════════

function initCalmMode() {
  const savedMode = localStorage.getItem('audit_independer_calm_mode');
  if (savedMode === 'true') {
    applyCalmMode(true);
  }
}

function applyCalmMode(isCalm) {
  const worklistView = document.getElementById('worklist-view');
  const btn = document.getElementById('calm-mode-btn');
  const label = document.getElementById('calm-mode-label');
  const icon = document.getElementById('calm-mode-icon');

  if (worklistView) {
    if (isCalm) {
      worklistView.classList.add('calm-mode-active');
      if (btn) btn.classList.add('active');
      if (label) label.textContent = 'Rustige weergave (Aan)';
      if (icon) icon.textContent = 'spa';
      localStorage.setItem('audit_independer_calm_mode', 'true');
    } else {
      worklistView.classList.remove('calm-mode-active');
      if (btn) btn.classList.remove('active');
      if (label) label.textContent = 'Rustige weergave';
      if (icon) icon.textContent = 'spa';
      localStorage.setItem('audit_independer_calm_mode', 'false');
    }
  }
}

function toggleCalmMode() {
  const worklistView = document.getElementById('worklist-view');
  const isCurrentlyCalm = worklistView?.classList.contains('calm-mode-active') || false;
  const newMode = !isCurrentlyCalm;
  applyCalmMode(newMode);

  if (newMode) {
    showToast('Rustige weergave ingeschakeld', 'Dashboard-statistieken geminimaliseerd naar een compacte statusstrip voor meer focus en rust.', 'success');
  } else {
    showToast('Standaard dashboard hersteld', 'Volledige overzichtskaarten en KPI-tegels zijn weer zichtbaar.', 'info');
  }
}
window.toggleCalmMode = toggleCalmMode;
window.applyCalmMode = applyCalmMode;

document.addEventListener('DOMContentLoaded', () => {
  initCalmMode();
  initUserTheme();
});
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initCalmMode();
  initUserTheme();
}

function toggleCalendarKpiGrid() {
  const kpiGrid = document.getElementById('cal-kpi-grid-elem');
  const btn = document.getElementById('cal-kpi-toggle-btn');
  const label = document.getElementById('cal-kpi-toggle-label');
  if (kpiGrid) {
    const isHidden = kpiGrid.classList.toggle('hidden');
    if (btn) btn.classList.toggle('active', isHidden);
    if (label) label.textContent = isHidden ? 'Statistieken tonen' : 'Rustige weergave';
    showToast(isHidden ? 'Rustige weergave ingeschakeld' : 'Statistieken zichtbaar', isHidden ? 'Kalender toont nu direct de rustige kalender- en wetgevingstabellen.' : 'Overzichtstegels zijn weer zichtbaar.', 'info');
  }
}
window.toggleCalendarKpiGrid = toggleCalendarKpiGrid;

// ─── Emergency Stop (Sending Stop) ───
let emergencyStopActive = false;

function openEmergencyStopModal() {
  const modal = document.getElementById('modal-content');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return;

  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title" style="color:${emergencyStopActive ? '#10b981' : '#ef4444'};">
        <span class="material-symbols-outlined">${emergencyStopActive ? 'lock_open' : 'pan_tool'}</span>
        Emergency stop · Sending stop
      </h3>
      <button class="modal-close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body" style="font-size:14px; line-height:1.6; color:var(--text-secondary);">
      <div style="background:${emergencyStopActive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; border:1px solid ${emergencyStopActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}; border-radius:8px; padding:14px; margin-bottom:16px;">
        <strong style="color:${emergencyStopActive ? '#10b981' : '#ef4444'}; font-size:15px; display:block; margin-bottom:4px;">
          ${emergencyStopActive ? 'STATUS: NOODSTOP IS ACTIEF' : 'STATUS: REGULIERE VERZENDING IN BEDRIJF'}
        </strong>
        ${emergencyStopActive
          ? 'Alle uitgaande e-mailnotificaties, certificaatrapporten en geautomatiseerde herinneringen naar vestigingen zijn momenteel <strong>gepauzeerd</strong> in de uitgaande wachtrij.'
          : 'Het platform verzendt automatisch e-mails, besluiten en herinneringen. Schakel de noodstop in tijdens calamiteiten, live drills of audit freeze.'}
      </div>
      <p style="margin-bottom:10px;">
        De noodstop blokkeert onmiddellijk het uitsturen van e-mails naar vestigingen en auditees zonder dat lopende audits of dossiers worden onderbroken.
      </p>
    </div>
    <div class="modal-footer" style="display:flex; justify-content:space-between; align-items:center;">
      <button class="tool-btn" onclick="closeModal()">Sluiten</button>
      <button class="tool-btn" style="background:${emergencyStopActive ? '#10b981' : '#dc2626'}; color:#ffffff; border-color:${emergencyStopActive ? '#059669' : '#b91c1c'}; font-weight:700;" onclick="toggleEmergencyStopState()">
        ${emergencyStopActive ? 'Verzending Hervatten' : 'Activeer Noodstop (Sending Stop)'}
      </button>
    </div>
  `;
  overlay.classList.remove('hidden');
}

function toggleEmergencyStopState() {
  emergencyStopActive = !emergencyStopActive;
  closeModal();
  const btn = document.querySelector('.emergency-stop-btn');
  if (btn) {
    if (emergencyStopActive) {
      btn.style.background = 'rgba(239, 68, 68, 0.9)';
      btn.style.color = '#ffffff';
      btn.style.borderColor = '#dc2626';
      showToast('Noodstop ingeschakeld', 'Verzending van alle notificaties is per direct geblokkeerd.', 'error');
    } else {
      btn.style.background = '';
      btn.style.color = '';
      btn.style.borderColor = '';
      showToast('Noodstop opgeheven', 'Reguliere verzending van notificaties is hervat.', 'success');
    }
  }
}

function showWaitingManagement() {
  ensureWorkNavActive();
  hideAllViews();
  const el = document.getElementById('waiting-management-view');
  if (el) el.classList.remove('hidden');

  const sublinks = document.querySelectorAll('#subnav-work .sub-nav-link');
  sublinks.forEach(l => l.classList.remove('active'));
  const waitTab = document.getElementById('sub-waiting-mgmt');
  if (waitTab) waitTab.classList.add('active');

  document.title = 'Audit Independer — Waiting for management';
  renderMgmtQuestionsTable();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ═══════════════════════════════════════════════════════════════════════
// WAITING FOR MANAGEMENT DATA & LOGIC (20 QUESTIONS)
// ═══════════════════════════════════════════════════════════════════════

const MGMT_QUESTIONS_DATA = [
  {
    id: 'Q-01',
    subject: 'Good Friday as a day off',
    now: 'Counted as a day off, 22 times, from 19 Apr 2019 to 30 Mar 2040.',
    question: 'Is Good Friday a day off for the certification body? If it is not, terms that run across it end a day earlier.',
    since: '12 Oct 2026',
    options: ['Keep Good Friday as a day off (current «Now» rule)', 'Treat Good Friday as regular working day']
  },
  {
    id: 'Q-02',
    subject: 'Ascension Day bridge day policy',
    now: 'Not counted as a day off',
    question: 'Should the Friday following Ascension Day be treated as a certification body non-working day for statutory audit deadlines?',
    since: '12 Oct 2026',
    options: ['Keep as regular working day', 'Mark Friday after Ascension Day as CB holiday']
  },
  {
    id: 'Q-03',
    subject: 'Fee exception for non-profit eco-lodge',
    now: 'Standard Category OS tariff applies (€ 890,00)',
    question: 'Establishment GK90014 requests a non-profit subsidy reduction of 15% on the annual surveillance fee.',
    since: '11 Oct 2026',
    options: ['Grant 15% non-profit discount', 'Uphold standard Category OS tariff']
  },
  {
    id: 'Q-04',
    subject: 'Accreditation validity extension',
    now: 'Strict 36-month validity cap',
    question: 'Van der Valk Hotel Breukelen (GK01358) requests a 60-day validity extension due to Dutch RvA witness audit scheduling.',
    since: '11 Oct 2026',
    options: ['Grant 60-day exceptional extension under surveillance', 'Reject extension and require immediate audit']
  },
  {
    id: 'Q-05',
    subject: 'Dual-auditor mandate for resort pitch >450',
    now: 'Single auditor threshold',
    question: 'Vakantiepark Schetsmatig has >450 pitches. Does management mandate a co-auditor for full on-site compliance review?',
    since: '10 Oct 2026',
    options: ['Mandate co-auditor team (2 auditors)', 'Maintain single qualified lead auditor']
  },
  {
    id: 'Q-06',
    subject: 'Remote surveillance audit for island hotel',
    now: 'On-site surveillance mandatory',
    question: 'Westcord Hotel Terschelling requests hybrid documentary inspection due to prolonged seasonal ferry disruptions.',
    since: '10 Oct 2026',
    options: ['Approve hybrid remote documentary audit with video tour', 'Require mandatory physical on-site audit']
  },
  {
    id: 'Q-07',
    subject: 'Approval of checklist v2026.3 criteria',
    now: 'Checklist criteria v2026.2 active',
    question: 'Scheme owner FEE published revised criteria update v2026.3. Confirm adoption for all audits commencing after 1 Nov 2026.',
    since: '09 Oct 2026',
    options: ['Adopt checklist v2026.3 effective 1 Nov 2026', 'Defer adoption to 1 Jan 2027']
  },
  {
    id: 'Q-08',
    subject: 'Late corrective action grace period',
    now: 'Strict 90-day closure gate',
    question: 'Amrâth Berghotel claims certified supplier supply-chain delay for water aerator installation. Grant 30-day grace period?',
    since: '09 Oct 2026',
    options: ['Grant 30-day grace period with conditional notice', 'Enforce suspension gate immediately']
  },
  {
    id: 'Q-09',
    subject: 'Auditor travel mileage reimbursement cap',
    now: 'Maximum €150/day standard policy',
    question: 'Lead auditor travel to remote Ardennes location exceeds daily mileage allowance by €78,50. Approve excess reimbursement?',
    since: '08 Oct 2026',
    options: ['Approve one-off travel expense reimbursement excess', 'Reimburse standard max allowance only']
  },
  {
    id: 'Q-10',
    subject: 'Centralized sampling for hotel group',
    now: 'Individual separate audit dossiers required',
    question: 'Fletcher Hotels requests centralized multi-site sampling methodology across 12 regional properties.',
    since: '08 Oct 2026',
    options: ['Approve multi-site sampling protocol (ISO/IEC 17021-1 Annex)', 'Require full individual audit per property']
  },
  {
    id: 'Q-11',
    subject: 'Fast-track decision turnaround request',
    now: 'Standard 10-day review period',
    question: 'Grand Hotel Huis ter Duin requests expedited 48-hour certification sign-off for corporate international ESG tender.',
    since: '07 Oct 2026',
    options: ['Approve fast-track review (with €350 express fee)', 'Keep standard 10-day review timeline']
  },
  {
    id: 'Q-12',
    subject: 'Language exception for Belgian auditee',
    now: 'Official dossier language must match national operator',
    question: 'Hotel Les Comtes (Wallonia) requests audit and decision documentation in English instead of French.',
    since: '07 Oct 2026',
    options: ['Allow bilingual English documentation', 'Enforce French language requirement']
  },
  {
    id: 'Q-13',
    subject: 'Auditor independence cooldown period',
    now: '24-month consulting cooldown',
    question: 'Auditor Sophie van Dam provided brief energy benchmark advice to auditee 20 months ago. Grant qualification waiver?',
    since: '06 Oct 2026',
    options: ['Grant independence clearance waiver', 'Enforce full 24-month impartiality cooldown']
  },
  {
    id: 'Q-14',
    subject: 'Re-audit grace period for seasonal camping',
    now: 'Fixed annual cycle anniversary date',
    question: 'Camping De Paalberg closes for winter from October to April. Shift renewal audit window to May 2027?',
    since: '06 Oct 2026',
    options: ['Align anniversary date to seasonal opening window (May)', 'Retain standard October anniversary']
  },
  {
    id: 'Q-15',
    subject: 'Direct electronic certificate distribution',
    now: 'Signed paper parchment + PDF',
    question: 'Should digital PDF certificates with verifiable cryptographic QR code be distributed immediately upon sign-off?',
    since: '05 Oct 2026',
    options: ['Enable instant digital QR issuance', 'Continue dispatching physical parchments']
  },
  {
    id: 'Q-16',
    subject: 'Unannounced surveillance inspection quota',
    now: '5% sample rate per annum',
    question: 'Scheme owner requests increasing unannounced spot checks to 8% of all certified establishments in 2027.',
    since: '05 Oct 2026',
    options: ['Adopt 8% unannounced inspection quota', 'Retain current 5% rate as per contract']
  },
  {
    id: 'Q-17',
    subject: 'Reviewer workload cap per calendar week',
    now: 'Maximum 8 dossiers per reviewer/week',
    question: 'High volume surge during October rush. Increase reviewer weekly cap to 12 dossiers temporarily?',
    since: '04 Oct 2026',
    options: ['Increase temporary weekly cap to 12 dossiers', 'Maintain strict safety cap of 8 dossiers']
  },
  {
    id: 'Q-18',
    subject: 'Handling auditee name change during cycle',
    now: 'Requires formal amendment dossier and fee',
    question: 'Postillion Hotel Arnhem changed registered holding name. Waive the €120 certificate re-issuance admin fee?',
    since: '04 Oct 2026',
    options: ['Waive re-issuance fee for simple name change', 'Charge standard administrative amendment fee']
  },
  {
    id: 'Q-19',
    subject: 'Emergency communication contact protocol',
    now: 'Email primary, fallback postal',
    question: 'Mandate mobile SMS emergency alerts for critical suspension deadlines across all active establishments?',
    since: '03 Oct 2026',
    options: ['Implement SMS notifications for urgent notices', 'Keep email as exclusive official notification channel']
  },
  {
    id: 'Q-20',
    subject: 'Retention period for recorded audit video footage',
    now: 'Stored for 90 days after final decision',
    question: 'Data protection officer suggests extending remote interview video retention to 365 days for accreditation appeals.',
    since: '03 Oct 2026',
    options: ['Extend video retention period to 365 days', 'Maintain GDPR-minimal 90-day retention']
  }
];

function renderMgmtQuestionsTable() {
  const tbody = document.getElementById('mgmt-questions-tbody');
  if (!tbody) return;

  tbody.innerHTML = MGMT_QUESTIONS_DATA.map(q => `
    <tr class="clickable-row">
      <td class="subject-cell">${q.subject}</td>
      <td class="now-cell">${q.now}</td>
      <td class="question-cell">${q.question}</td>
      <td class="since-cell mono">${q.since}</td>
      <td style="text-align:right;">
        <button class="open-row-btn" onclick="openMgmtAnswerModal('${q.id}')">
          <span class="material-symbols-outlined">gavel</span> Answer
        </button>
      </td>
    </tr>
  `).join('');
}

function openMgmtAnswerModal(id) {
  const q = MGMT_QUESTIONS_DATA.find(item => item.id === id);
  if (!q) return;

  const overlay = document.getElementById('mgmt-answer-modal-overlay');
  const body = document.getElementById('mgmt-answer-body');
  if (!overlay || !body) return;

  body.innerHTML = `
    <div style="margin-bottom:16px;">
      <h4 style="font-size:16px; font-weight:700; color:var(--text-primary); margin:0 0 6px 0;">${q.subject}</h4>
      <p style="font-size:13.5px; color:var(--text-secondary); line-height:1.55; margin-bottom:12px;">${q.question}</p>
      <div style="background:var(--bg-surface); border:1px solid var(--border-default); border-radius:6px; padding:12px; font-size:13px; color:var(--text-muted); margin-bottom:16px;">
        <strong style="color:var(--text-primary);">Huidige standaard («Now»):</strong><br/>
        ${q.now}
      </div>
    </div>
    <div style="margin-bottom:16px;">
      <label style="display:block; font-size:12px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:8px;">Kies directiebesluit</label>
      ${q.options.map((opt, idx) => `
        <label style="display:flex; align-items:center; gap:10px; padding:8px 10px; background:var(--bg-card); border:1px solid var(--border-default); border-radius:6px; margin-bottom:8px; cursor:pointer;">
          <input type="radio" name="mgmt_decision_opt" value="${opt}" ${idx === 0 ? 'checked' : ''} style="accent-color:#3b82f6;" />
          <span style="font-size:13.5px; color:var(--text-primary);">${opt}</span>
        </label>
      `).join('')}
    </div>
    <div style="margin-bottom:20px;">
      <label style="display:block; font-size:12px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:6px;">Toelichting & motivering (Audittrail)</label>
      <textarea id="mgmt-answer-notes" rows="3" style="width:100%; box-sizing:border-box; background:var(--bg-input, #0f172a); border:1px solid var(--border-default); border-radius:6px; padding:8px 12px; color:var(--text-primary); font-size:13px;" placeholder="Voer toelichting in voor het besluitenregister..."></textarea>
    </div>
    <div style="display:flex; justify-content:flex-end; gap:10px;">
      <button class="tool-btn" onclick="closeMgmtAnswerModal()">Annuleren</button>
      <button class="tool-btn" style="background:#2563eb; color:#fff; border-color:#1d4ed8; font-weight:700;" onclick="submitMgmtAnswer('${q.id}')">
        Besluit vastleggen
      </button>
    </div>
  `;

  overlay.classList.remove('hidden');
  overlay.classList.add('visible');
}

function closeMgmtAnswerModal() {
  const overlay = document.getElementById('mgmt-answer-modal-overlay');
  if (overlay) {
    overlay.classList.remove('visible');
    overlay.classList.add('hidden');
  }
}

function submitMgmtAnswer(id) {
  const idx = MGMT_QUESTIONS_DATA.findIndex(q => q.id === id);
  if (idx !== -1) {
    const item = MGMT_QUESTIONS_DATA[idx];
    MGMT_QUESTIONS_DATA.splice(idx, 1);
    closeMgmtAnswerModal();
    renderMgmtQuestionsTable();
    showToast('Directiebesluit opgeslagen', `Besluit voor «${item.subject}» is succesvol geregistreerd in de audittrail.`, 'success');

    // Update subnav count
    const pill = document.querySelector('#sub-waiting-mgmt .sub-pill');
    if (pill) pill.textContent = MGMT_QUESTIONS_DATA.length;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// NATIONAL OPERATORS DATA & LOGIC
// ═══════════════════════════════════════════════════════════════════════

const NATIONAL_OPERATORS_DATA = [
  {
    id: 'NO-NL',
    name: 'Stichting KMVK (Keurmerk Milieu, Veiligheid en Kwaliteit)',
    countries: 'Netherlands',
    scheme: 'Green Key Netherlands',
    contact: 'Erik van Dijk',
    email: 'info@kmvk.nl',
    count: '18 establishments',
    status: 'Active'
  },
  {
    id: 'NO-BE',
    name: 'GoodPlanet Belgium',
    countries: 'Belgium',
    scheme: 'Green Key Belgium (Flanders & Wallonia)',
    contact: 'Annelies Braekevelt',
    email: 'greenkey@goodplanet.be',
    count: '6 establishments',
    status: 'Active'
  },
  {
    id: 'NO-DE',
    name: 'Deutsche Gesellschaft für Umwelterziehung (FEE Germany)',
    countries: 'Germany',
    scheme: 'Green Key Deutschland',
    contact: 'Markus Weber',
    email: 'kontakt@fee-deutschland.de',
    count: '5 establishments',
    status: 'Active'
  }
];

function renderNationalOperatorsTable() {
  const tbody = document.getElementById('nat-operators-tbody');
  if (!tbody) return;

  tbody.innerHTML = NATIONAL_OPERATORS_DATA.map(o => `
    <tr class="clickable-row">
      <td style="font-weight:600; color:var(--text-primary);">${o.name}</td>
      <td>${o.countries}</td>
      <td><span class="status-badge" style="background:rgba(59,130,246,0.12); color:#60a5fa; border:1px solid rgba(59,130,246,0.3);">${o.scheme}</span></td>
      <td>${o.contact}</td>
      <td class="mono" style="font-size:12.5px;">${o.email}</td>
      <td><strong>${o.count}</strong></td>
      <td><span class="status-badge success">${o.status}</span></td>
      <td style="text-align:right;">
        <button class="open-row-btn" onclick="showToast('National Operator', 'Gegevens voor ${o.name} geopend.', 'info')">
          <span class="material-symbols-outlined">visibility</span> Open
        </button>
      </td>
    </tr>
  `).join('');
}

function openAddNationalOperatorModal() {
  showToast('Record a National Operator', 'Formulier voor het registreren van een nieuwe National Operator wordt geopend.', 'info');
}

// ═══════════════════════════════════════════════════════════════════════
// PARTIES: REQUESTS DATA & LOGIC
// ═══════════════════════════════════════════════════════════════════════

const PARTIES_REQUESTS_DATA = [
  {
    to: 'Amrâth Berghotel Amersfoort',
    type: 'establishment',
    whatAsked: 'Pre-screening documentation & intake questionnaire',
    sent: '04 Oct 2026',
    whereTheyAre: 'Waiting for an answer',
    due: '18 Oct 2026',
    status: 'pending'
  },
  {
    to: 'Grand Hotel Huis ter Duin',
    type: 'establishment',
    whatAsked: 'Confirmation of next audit agreement and fee quote',
    sent: '02 Oct 2026',
    whereTheyAre: 'Link opened (3 times)',
    due: '16 Oct 2026',
    status: 'opened'
  },
  {
    to: 'Vakantiepark Schetsmatig',
    type: 'establishment',
    whatAsked: 'Suspension rectification corrective action report',
    sent: '28 Sep 2026',
    whereTheyAre: 'Overdue · Waiting for answer',
    due: '05 Oct 2026',
    status: 'overdue'
  },
  {
    to: 'FEE Germany (Deutsche Gesellschaft)',
    type: 'operator',
    whatAsked: 'Approval of cross-border auditor deployment in NRW',
    sent: '05 Oct 2026',
    whereTheyAre: 'Submitted · Awaiting review',
    due: '19 Oct 2026',
    status: 'submitted'
  },
  {
    to: 'Stichting KMVK',
    type: 'operator',
    whatAsked: 'Annual quota reconciliation for Q3 2026 audits',
    sent: '01 Oct 2026',
    whereTheyAre: 'Completed',
    due: '15 Oct 2026',
    status: 'completed'
  },
  {
    to: 'Jan de Vries (Auditor)',
    type: 'auditor',
    whatAsked: 'Availability schedule for November surveillance batch',
    sent: '06 Oct 2026',
    whereTheyAre: 'Waiting for an answer',
    due: '20 Oct 2026',
    status: 'pending'
  },
  {
    to: 'Sophie van Dam (Auditor)',
    type: 'auditor',
    whatAsked: 'Annual impartiality and independence declaration',
    sent: '03 Oct 2026',
    whereTheyAre: 'Completed',
    due: '17 Oct 2026',
    status: 'completed'
  }
];

function renderPartiesRequestsTable(filter = 'all') {
  const tbody = document.getElementById('parties-requests-tbody');
  if (!tbody) return;

  const filtered = PARTIES_REQUESTS_DATA.filter(r => filter === 'all' || r.type === filter);

  tbody.innerHTML = filtered.map(r => `
    <tr class="clickable-row">
      <td style="font-weight:600; color:var(--text-primary);">${r.to}</td>
      <td><span class="status-badge" style="text-transform:capitalize;">${r.type}</span></td>
      <td>${r.whatAsked}</td>
      <td class="mono" style="font-size:12.5px;">${r.sent}</td>
      <td>
        <span class="status-badge ${r.status === 'overdue' ? 'suspended' : r.status === 'completed' ? 'success' : 'review'}">
          ${r.whereTheyAre}
        </span>
      </td>
      <td class="mono ${r.status === 'overdue' ? 'status-overdue-text' : ''}" style="font-size:12.5px;">${r.due}</td>
      <td style="text-align:right; white-space:nowrap;">
        <button class="open-row-btn" onclick="showToast('Verzoek', 'Herinneringslink verzonden naar ${r.to}.', 'success')" title="Stuur link opnieuw">
          <span class="material-symbols-outlined">send</span> Send again
        </button>
      </td>
    </tr>
  `).join('');
}

function filterRequestsTable(type) {
  const buttons = document.querySelectorAll('#requests-filter-pills .filter-pill-btn');
  buttons.forEach(b => b.classList.remove('active'));
  event.target.closest('.filter-pill-btn')?.classList.add('active');
  renderPartiesRequestsTable(type);
}

function exportRequestsCSV() {
  showToast('Exporteer CSV', 'Requests lijst succesvol geëxporteerd naar requests.csv.', 'success');
}

// ═══════════════════════════════════════════════════════════════════════
// PARTIES: OUTREACH DATA & LOGIC
// ═══════════════════════════════════════════════════════════════════════

const OUTREACH_CAMPAIGNS_DATA = [
  {
    group: 'Auditors (NL / EN)',
    languages: 'Dutch, English',
    recipients: 14,
    prepared: '04 Oct 2026',
    sent: '14 sent (100%)',
    answers: '11 answers received (79%)',
    status: 'sent'
  },
  {
    group: 'Establishments (Batch 1 - Hotel & Resort)',
    languages: 'Dutch, French, German',
    recipients: 24,
    prepared: '05 Oct 2026',
    sent: '24 sent (100%)',
    answers: '18 answers received (75%)',
    status: 'sent'
  },
  {
    group: 'Establishments (Batch 2 - Camping & Parks)',
    languages: 'Dutch, English',
    recipients: 12,
    prepared: '11 Oct 2026',
    sent: 'Ready to send (0/12)',
    answers: '0 answers',
    status: 'ready'
  }
];

function renderOutreachCampaignsTable() {
  const tbody = document.getElementById('outreach-campaigns-tbody');
  if (!tbody) return;

  tbody.innerHTML = OUTREACH_CAMPAIGNS_DATA.map(c => `
    <tr class="clickable-row">
      <td style="font-weight:600; color:var(--text-primary);">${c.group}</td>
      <td>${c.languages}</td>
      <td><strong>${c.recipients} ontvangers</strong></td>
      <td class="mono" style="font-size:12.5px;">${c.prepared}</td>
      <td><span class="status-badge ${c.status === 'sent' ? 'success' : 'review'}">${c.sent}</span></td>
      <td>${c.answers}</td>
      <td style="text-align:right;">
        ${c.status === 'ready'
          ? `<button class="open-row-btn" style="background:#2563eb; color:#fff;" onclick="startOutreachCampaign('${c.group}')">
               <span class="material-symbols-outlined">send</span> Start sending
             </button>`
          : `<button class="open-row-btn" onclick="showToast('Outreach details', 'Verzendlogboeken voor ${c.group} geopend.', 'info')">
               <span class="material-symbols-outlined">visibility</span> Details
             </button>`
        }
      </td>
    </tr>
  `).join('');
}

function prepareOutreachGroupModal() {
  showToast('Prepare a group', 'Kies doelgroep en criteria voor nieuwe e-mailcampagne.', 'info');
}

function startOutreachCampaign(group) {
  showToast('Campagne gestart', `Verzending voor ${group} gestart via gecontroleerde wachtrij.`, 'success');
  const c = OUTREACH_CAMPAIGNS_DATA.find(i => i.group === group);
  if (c) {
    c.status = 'sent';
    c.sent = `${c.recipients} sent (100%)`;
    renderOutreachCampaignsTable();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EMERGENCY STOP (SENDING STOP) PAGE
// ═══════════════════════════════════════════════════════════════════════

function openSendingStopView() {
  hideAllViews();
  const el = document.getElementById('sending-stop-view');
  if (el) el.classList.remove('hidden');
  renderSendingStopPage();
  document.title = 'Audit Independer — Stop everything going out';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderSendingStopPage() {
  const hero = document.getElementById('sending-stop-hero');
  const title = document.getElementById('sending-stop-status-title');
  const desc = document.getElementById('sending-stop-status-desc');
  const btn = document.getElementById('btn-toggle-sending-stop-page');
  const label = document.getElementById('btn-toggle-sending-stop-label');

  if (!hero || !title || !desc || !btn || !label) return;

  if (emergencyStopActive) {
    hero.classList.add('active-stop');
    title.textContent = 'Sending is stopped';
    title.style.color = '#ef4444';
    desc.textContent = 'Noodstop is actief. Alle uitgaande berichten naar vestigingen en auditees worden tegengehouden in de uitgaande wachtrij.';
    btn.className = 'sending-stop-toggle-btn btn-resume';
    label.textContent = 'Resume sending';
  } else {
    hero.classList.remove('active-stop');
    title.textContent = 'Sending is not stopped';
    title.style.color = 'var(--text-primary)';
    desc.textContent = 'Het platform verzendt automatisch e-mails, besluiten en herinneringen. Schakel de noodstop in tijdens calamiteiten of live drills.';
    btn.className = 'sending-stop-toggle-btn btn-stop';
    label.textContent = 'Stop sending';
  }
}

// ═══════════════════════════════════════════════════════════════════════
// WORKLIST FILTER POPOVER & MORE LATER ITEMS
// ═══════════════════════════════════════════════════════════════════════

let moreLaterExpanded = false;

function toggleWorklistFilterPopover() {
  const popover = document.getElementById('worklist-filter-popover');
  if (popover) {
    popover.classList.toggle('hidden');
  }
}

function handleWorklistFilterCheckboxChange() {
  const checkMe = document.getElementById('check-me')?.checked;
  const checkOthers = document.getElementById('check-others')?.checked;
  const label = document.getElementById('worklist-filter-count-label');

  let activeCount = 0;
  if (checkMe) activeCount++;
  if (checkOthers) activeCount++;

  if (label) {
    label.textContent = `Filter · ${activeCount} on`;
  }
}

function resetWorklistFilters() {
  const checkMe = document.getElementById('check-me');
  const checkOthers = document.getElementById('check-others');
  if (checkMe) checkMe.checked = true;
  if (checkOthers) checkOthers.checked = false;
  handleWorklistFilterCheckboxChange();
  toggleWorklistFilterPopover();
  showToast('Filters hersteld', 'Weergavefilters gereset naar standaard.', 'info');
}

function toggleMoreLaterItems() {
  moreLaterExpanded = !moreLaterExpanded;
  const btn = document.getElementById('btn-show-more-later');
  if (!btn) return;

  if (moreLaterExpanded) {
    btn.innerHTML = `<span class="material-symbols-outlined">expand_less</span><span>Toon minder (toon eerste 10 van 21)</span>`;
    showToast('Worklist', 'Alle 21 geplande dossiers zijn nu zichtbaar.', 'info');
  } else {
    btn.innerHTML = `<span class="material-symbols-outlined">expand_more</span><span>11 more later. Show all (21)</span>`;
  }
}

// Close filter popover when clicking outside
document.addEventListener('click', (e) => {
  const wrapper = document.getElementById('filter-popover-wrapper');
  const popover = document.getElementById('worklist-filter-popover');
  if (wrapper && popover && !wrapper.contains(e.target)) {
    popover.classList.add('hidden');
  }
});

// ═══════════════════════════════════════════════════════════════════════
// WHAT'S NEW MODAL LOGIC (4-STEP TOUR)
// ═══════════════════════════════════════════════════════════════════════

let whatsNewCurrentStep = 0;

const WHATS_NEW_STEPS = [
  {
    tag: 'Release highlight',
    date: '13 Oct 2026',
    title: 'Calm is the standard look',
    desc: 'Navy on ivory is the new standard house style across the entire platform. The previous "Familiar" and separate "House style" options have been retired. Individual users can customize their appearance under <strong>«My theme»</strong>, while administrators set global workspace defaults under <strong>«Default theme»</strong>.'
  },
  {
    tag: 'Financial grid',
    date: '12 Oct 2026',
    title: 'One price list for every audit',
    desc: 'Standard prices for all auditors are now accessible in one clear matrix (Category, Size, Establishment pays, Auditor gets, Margin). Transparent accounting ensures immediate margin calculations during pricing commission.'
  },
  {
    tag: 'Accessibility & themes',
    date: '12 Oct 2026',
    title: 'Your own colours and text size',
    desc: 'Customize your personal workspace with 5 curated high-contrast themes and dynamic text scaling (smaller, normal, larger). Settings persist automatically across your browser sessions.'
  },
  {
    tag: 'Practice environment',
    date: '04 Oct 2026',
    title: 'Safe practice drills in Rehearsal',
    desc: 'Every establishment, dossier and decision in this rehearsal environment is fictitious. You can safely prepare outreach batches, test decisions and drill emergency stops without emailing real auditees.'
  }
];

function openWhatsNewModal() {
  whatsNewCurrentStep = 0;
  renderWhatsNewStep();
  const overlay = document.getElementById('whats-new-modal-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.classList.add('visible');
  }
}

function closeWhatsNewModal() {
  const overlay = document.getElementById('whats-new-modal-overlay');
  if (overlay) {
    overlay.classList.remove('visible');
    overlay.classList.add('hidden');
  }
}

function renderWhatsNewStep() {
  const body = document.getElementById('whats-new-modal-body');
  const dotsContainer = document.getElementById('whats-new-dots');
  const prevBtn = document.getElementById('btn-whats-new-prev');
  const nextBtn = document.getElementById('btn-whats-new-next');
  if (!body || !dotsContainer || !nextBtn) return;

  const step = WHATS_NEW_STEPS[whatsNewCurrentStep];

  body.innerHTML = `
    <div class="whats-new-step-header">
      <span class="whats-new-step-tag">
        <span class="material-symbols-outlined" style="font-size:15px;">sparkles</span>
        ${step.tag}
      </span>
      <span class="whats-new-date">${step.date} · Point ${whatsNewCurrentStep + 1} of ${WHATS_NEW_STEPS.length}</span>
    </div>
    <div class="whats-new-card">
      <div class="whats-new-card-title">${step.title}</div>
      <div class="whats-new-card-desc">${step.desc}</div>
    </div>
  `;

  // Update dots
  dotsContainer.innerHTML = WHATS_NEW_STEPS.map((_, idx) => `
    <span class="step-dot ${idx === whatsNewCurrentStep ? 'active' : ''}"></span>
  `).join('');

  // Update buttons
  if (prevBtn) {
    prevBtn.style.display = whatsNewCurrentStep > 0 ? 'inline-flex' : 'none';
  }
  if (whatsNewCurrentStep === WHATS_NEW_STEPS.length - 1) {
    nextBtn.textContent = 'Begrepen (Sluiten)';
  } else {
    nextBtn.textContent = 'Volgende →';
  }
}

function nextWhatsNewStep() {
  if (whatsNewCurrentStep < WHATS_NEW_STEPS.length - 1) {
    whatsNewCurrentStep++;
    renderWhatsNewStep();
  } else {
    closeWhatsNewModal();
    showToast("What's new", 'Rondleiding voltooid.', 'info');
  }
}

function prevWhatsNewStep() {
  if (whatsNewCurrentStep > 0) {
    whatsNewCurrentStep--;
    renderWhatsNewStep();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// HELP CENTER MODAL LOGIC
// ═══════════════════════════════════════════════════════════════════════

function openHelpModal() {
  switchHelpTab('videos');
  const overlay = document.getElementById('help-modal-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.classList.add('visible');
  }
}

function closeHelpModal() {
  const overlay = document.getElementById('help-modal-overlay');
  if (overlay) {
    overlay.classList.remove('visible');
    overlay.classList.add('hidden');
  }
}

function switchHelpTab(tab) {
  const tabs = ['videos', 'shortcuts', 'runbook'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-btn-${t}`);
    const content = document.getElementById(`help-tab-${t}`);
    if (btn) btn.classList.toggle('active', t === tab);
    if (content) content.classList.toggle('hidden', t !== tab);
  });
}

// ═══════════════════════════════════════════════════════════════════════
// WINDOW GLOBAL EXPORTS
// ═══════════════════════════════════════════════════════════════════════

window.openEmergencyStopModal = openEmergencyStopModal;
window.toggleEmergencyStopState = toggleEmergencyStopState;
window.showWaitingManagement = showWaitingManagement;
window.showNationalOperators = showNationalOperators;
window.showPartiesRequests = showPartiesRequests;
window.showPartiesOutreach = showPartiesOutreach;
window.openSendingStopView = openSendingStopView;
window.renderSendingStopPage = renderSendingStopPage;

window.renderMgmtQuestionsTable = renderMgmtQuestionsTable;
window.openMgmtAnswerModal = openMgmtAnswerModal;
window.closeMgmtAnswerModal = closeMgmtAnswerModal;
window.submitMgmtAnswer = submitMgmtAnswer;

window.renderNationalOperatorsTable = renderNationalOperatorsTable;
window.openAddNationalOperatorModal = openAddNationalOperatorModal;
window.renderPartiesRequestsTable = renderPartiesRequestsTable;
window.filterRequestsTable = filterRequestsTable;
window.exportRequestsCSV = exportRequestsCSV;
window.renderOutreachCampaignsTable = renderOutreachCampaignsTable;
window.prepareOutreachGroupModal = prepareOutreachGroupModal;
window.startOutreachCampaign = startOutreachCampaign;

window.toggleWorklistFilterPopover = toggleWorklistFilterPopover;
window.handleWorklistFilterCheckboxChange = handleWorklistFilterCheckboxChange;
window.resetWorklistFilters = resetWorklistFilters;
window.toggleMoreLaterItems = toggleMoreLaterItems;

window.openWhatsNewModal = openWhatsNewModal;
window.closeWhatsNewModal = closeWhatsNewModal;
window.renderWhatsNewStep = renderWhatsNewStep;
window.nextWhatsNewStep = nextWhatsNewStep;
window.prevWhatsNewStep = prevWhatsNewStep;

window.openHelpModal = openHelpModal;
window.closeHelpModal = closeHelpModal;
window.switchHelpTab = switchHelpTab;

// ═══════════════════════════════════════════════════════════════════════
// AUDITOR REGISTRATION FORM & PORTAL LOGIC
// ═══════════════════════════════════════════════════════════════════════

function getAuditorFormTemplate(prefix) {
  return `
    <!-- Deel 1: Persoons- & Bedrijfsgegevens -->
    <div class="form-section-card">
      <div class="form-section-header">
        <div class="form-section-num">1</div>
        <div>
          <h4 class="form-section-title">Persoons- en Bedrijfsgegevens</h4>
          <p class="form-section-subtitle">Lead Auditor identificatie & officiële facturatiegegevens</p>
        </div>
      </div>
      <div class="form-grid-2">
        <div class="form-field-group">
          <label>Voor- en achternaam <span class="req">*</span></label>
          <input type="text" class="form-input-control" id="${prefix}-name" placeholder="bijv. Marleen van den Berg" required />
        </div>
        <div class="form-field-group">
          <label>E-mailadres <span class="req">*</span></label>
          <input type="email" class="form-input-control" id="${prefix}-email" placeholder="m.vandenberg@auditservices.nl" required />
        </div>
      </div>
      <div class="form-grid-2">
        <div class="form-field-group">
          <label>Telefoonnummer <span class="req">*</span></label>
          <input type="tel" class="form-input-control" id="${prefix}-phone" placeholder="+31 6 12345678" required />
        </div>
        <div class="form-field-group">
          <label>Bedrijfsnaam / ZZP <span class="req">*</span></label>
          <input type="text" class="form-input-control" id="${prefix}-company" placeholder="Van den Berg Eco Auditing B.V." required />
        </div>
      </div>
      <div class="form-grid-3">
        <div class="form-field-group">
          <label>KvK-nummer <span class="req">*</span></label>
          <input type="text" class="form-input-control mono" id="${prefix}-kvk" placeholder="12345678" required />
        </div>
        <div class="form-field-group">
          <label>BTW-nummer <span class="req">*</span></label>
          <input type="text" class="form-input-control mono" id="${prefix}-vat" placeholder="NL882910293B01" required />
        </div>
        <div class="form-field-group">
          <label>IBAN (Uitbetalingen) <span class="req">*</span></label>
          <input type="text" class="form-input-control mono" id="${prefix}-iban" placeholder="NL91 ABNA 0412 3456 78" required />
        </div>
      </div>
    </div>

    <!-- Deel 2: Werkgebied, Standplaats & Talen -->
    <div class="form-section-card">
      <div class="form-section-header">
        <div class="form-section-num">2</div>
        <div>
          <h4 class="form-section-title">Werkgebied, Standplaats & Talen</h4>
          <p class="form-section-subtitle">Bepaalt automatische toewijzing en reiskostenberekening</p>
        </div>
      </div>
      <div class="form-grid-3">
        <div class="form-field-group">
          <label>Land van vestiging <span class="req">*</span></label>
          <select class="form-input-control" id="${prefix}-country" required>
            <option value="Netherlands">Nederland</option>
            <option value="Belgium">België</option>
            <option value="Germany">Duitsland</option>
            <option value="Other">Overig / Internationaal</option>
          </select>
        </div>
        <div class="form-field-group">
          <label>Standplaats & Postcode <span class="req">*</span></label>
          <input type="text" class="form-input-control" id="${prefix}-city" placeholder="3512 JE Utrecht" required />
        </div>
        <div class="form-field-group">
          <label>Maximale reisstraal <span class="req">*</span></label>
          <select class="form-input-control" id="${prefix}-radius" required>
            <option value="50">Tot 50 km</option>
            <option value="75" selected>Tot 75 km (Standaard)</option>
            <option value="150">Tot 150 km</option>
            <option value="national">Landelijk inzetbaar</option>
          </select>
        </div>
      </div>
      <div class="form-field-group">
        <label>Mondelinge audittalen on-site <span class="req">*</span> <small style="font-weight:normal; color:var(--text-muted);">(Rapportage en review in het systeem gebeurt altijd in het Engels)</small></label>
        <div style="display:flex; gap:16px; flex-wrap:wrap; padding:8px 0;">
          <label style="display:inline-flex; align-items:center; gap:6px; font-size:13px; color:var(--text-primary); cursor:pointer;">
            <input type="checkbox" name="${prefix}-lang" value="NL" checked style="accent-color:#3b82f6;" /> Nederlands
          </label>
          <label style="display:inline-flex; align-items:center; gap:6px; font-size:13px; color:var(--text-primary); cursor:pointer;">
            <input type="checkbox" name="${prefix}-lang" value="EN" checked style="accent-color:#3b82f6;" /> Engels
          </label>
          <label style="display:inline-flex; align-items:center; gap:6px; font-size:13px; color:var(--text-primary); cursor:pointer;">
            <input type="checkbox" name="${prefix}-lang" value="FR" style="accent-color:#3b82f6;" /> Frans
          </label>
          <label style="display:inline-flex; align-items:center; gap:6px; font-size:13px; color:var(--text-primary); cursor:pointer;">
            <input type="checkbox" name="${prefix}-lang" value="DE" style="accent-color:#3b82f6;" /> Duits
          </label>
        </div>
      </div>
    </div>

    <!-- Deel 3: Green Key Categorie-bevoegdheden -->
    <div class="form-section-card">
      <div class="form-section-header">
        <div class="form-section-num">3</div>
        <div>
          <h4 class="form-section-title">Bevoegdheid Bedrijfscategorieën</h4>
          <p class="form-section-subtitle">Vink de Green Key categorieën aan waarvoor u bevoegd bent of audits heeft geleid</p>
        </div>
      </div>
      <div class="cat-checkbox-grid">
        <label class="cat-checkbox-card">
          <input type="checkbox" name="${prefix}-cat" value="HH" checked />
          <div class="cat-checkbox-info">
            <span class="cat-code-badge">HH</span>
            <span class="cat-name">Hotels, Hostels & B&B</span>
          </div>
        </label>
        <label class="cat-checkbox-card">
          <input type="checkbox" name="${prefix}-cat" value="REC" checked />
          <div class="cat-checkbox-info">
            <span class="cat-code-badge">REC</span>
            <span class="cat-name">Campings & Vakantieparken</span>
          </div>
        </label>
        <label class="cat-checkbox-card">
          <input type="checkbox" name="${prefix}-cat" value="RES" />
          <div class="cat-checkbox-info">
            <span class="cat-code-badge">RES</span>
            <span class="cat-name">Restaurants & Catering</span>
          </div>
        </label>
        <label class="cat-checkbox-card">
          <input type="checkbox" name="${prefix}-cat" value="CON" />
          <div class="cat-checkbox-info">
            <span class="cat-code-badge">CON</span>
            <span class="cat-name">Conferentiecentra & MICE</span>
          </div>
        </label>
        <label class="cat-checkbox-card">
          <input type="checkbox" name="${prefix}-cat" value="ATT" />
          <div class="cat-checkbox-info">
            <span class="cat-code-badge">ATT</span>
            <span class="cat-name">Dagattracties & Musea</span>
          </div>
        </label>
      </div>
    </div>

    <!-- Deel 4: Kwalificaties & Certificeringen -->
    <div class="form-section-card">
      <div class="form-section-header">
        <div class="form-section-num">4</div>
        <div>
          <h4 class="form-section-title">Kwalificaties & Documenten</h4>
          <p class="form-section-subtitle">Verplichte bewijsstukken voor accreditatiedossier (ISO/IEC 17021-1)</p>
        </div>
      </div>
      <div class="form-grid-2">
        <div class="form-field-group">
          <label>Green Key Certificaat Bekwaamheid Nr. <span class="req">*</span></label>
          <input type="text" class="form-input-control mono" id="${prefix}-certno" placeholder="bijv. GK-COMP-88410" required />
        </div>
        <div class="form-field-group">
          <label>Geldig tot datum <span class="req">*</span></label>
          <input type="date" class="form-input-control" id="${prefix}-certexpiry" value="2027-12-31" required />
        </div>
      </div>
      <div class="form-grid-2" style="margin-top:10px;">
        <div class="upload-dropzone" onclick="showToast('Document upload', 'CV document geüpload en gekoppeld aan dossier.', 'success')">
          <div class="material-symbols-outlined upload-dropzone-icon">description</div>
          <div class="upload-dropzone-text">Curriculum Vitae (CV)</div>
          <div class="upload-dropzone-hint">PDF of DOCX met relevante auditervaring</div>
        </div>
        <div class="upload-dropzone" onclick="showToast('Document upload', 'Polis beroepsaansprakelijkheid gekoppeld.', 'success')">
          <div class="material-symbols-outlined upload-dropzone-icon">verified_user</div>
          <div class="upload-dropzone-text">Beroepsaansprakelijkheidsverzekering</div>
          <div class="upload-dropzone-hint">Kopie actuele polisdekking</div>
        </div>
      </div>
    </div>

    <!-- Deel 5: Wettelijke Poortvoorwaarden & Verklaringen -->
    <div class="form-section-card">
      <div class="form-section-header">
        <div class="form-section-num">5</div>
        <div>
          <h4 class="form-section-title">Integriteit, Onpartijdigheid & Overeenkomst</h4>
          <p class="form-section-subtitle">Wettelijke poortvoorwaarden voor onafhankelijke certificatie</p>
        </div>
      </div>
      
      <div class="poortvoorwaarden-box">
        <div class="poortvoorwaarden-title">
          <span class="material-symbols-outlined" style="font-size:18px;">gavel</span>
          <span>Wettelijke Accreditatieverklaringen (ISO/IEC 17021-1)</span>
        </div>
        
        <label class="poort-checklist-item">
          <input type="checkbox" id="${prefix}-cond-independence" required />
          <div>
            <strong>Onafhankelijkheidsverklaring (24 maanden cooldown):</strong>
            Ik verklaar dat ik in de afgelopen 24 maanden geen consultancy-, advies- of managementsystemen heb geïmplementeerd voor vestigingen waarvoor ik audits zal uitvoeren.
          </div>
        </label>

        <label class="poort-checklist-item">
          <input type="checkbox" id="${prefix}-cond-nda" required />
          <div>
            <strong>Geheimhoudingsovereenkomst (NDA) & Gedragscode:</strong>
            Ik ga akkoord met de geheimhoudingsplicht, de Gedragscode en de regels beschreven in het Audit Independer Auditor Handbook.
          </div>
        </label>

        <label class="poort-checklist-item">
          <input type="checkbox" id="${prefix}-cond-tariffs" required />
          <div>
            <strong>Standaard Tarieven & Declaratie-akkoord:</strong>
            Ik conformeer mij aan de vastgelegde vergoedingen per categorie (€ 300 / audit) en de geldende kilometervergoeding volgens de tarievenlijst.
          </div>
        </label>

        <label class="poort-checklist-item">
          <input type="checkbox" id="${prefix}-cond-accuracy" required />
          <div>
            <strong>Waarheidsgetrouwe opgave:</strong>
            Ik bevestig dat bovenstaande gegevens en certificaten naar waarheid zijn ingevuld en actueel zijn.
          </div>
        </label>
      </div>

      <div class="form-field-group">
        <label>Eventuele uitgesloten ketens of relaties (Chains barred / Belangen):</label>
        <input type="text" class="form-input-control" id="${prefix}-barred" placeholder="bijv. Geen, of: Van der Valk Hotel Utrecht (familieband)" />
      </div>
    </div>

    <!-- Actiebalk onderaan formulier -->
    <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; margin-top:10px;">
      <button type="button" class="tool-btn" onclick="${prefix === 'modal' ? 'closeAuditorRegistrationModal()' : 'showAuditorsList()'}">
        Annuleren
      </button>
      <button type="submit" class="tool-btn" style="background:#2563eb; color:#ffffff; border-color:#1d4ed8; font-weight:700; padding:10px 24px; font-size:14px;">
        <span class="material-symbols-outlined" style="font-size:18px;">send</span>
        <span>Aanmelding Indienen & Dossier Registreren</span>
      </button>
    </div>
  `;
}

function openAuditorRegistrationModal() {
  const container = document.getElementById('auditor-form-fields-container-modal');
  if (container) {
    container.innerHTML = getAuditorFormTemplate('modal');
  }
  const overlay = document.getElementById('auditor-reg-modal-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.classList.add('visible');
  }
}

function closeAuditorRegistrationModal() {
  const overlay = document.getElementById('auditor-reg-modal-overlay');
  if (overlay) {
    overlay.classList.remove('visible');
    overlay.classList.add('hidden');
  }
}

function openAuditorPublicPortal() {
  hideAllViews();
  const el = document.getElementById('auditor-registration-public-view');
  if (el) el.classList.remove('hidden');

  const container = document.getElementById('auditor-form-fields-container-page');
  if (container && (!container.children || container.children.length === 0)) {
    container.innerHTML = getAuditorFormTemplate('page');
  }

  document.title = 'Audit Independer — Aanmelden Green Key Auditor';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handleAuditorRegistrationSubmit(e, prefix) {
  e.preventDefault();

  const name = document.getElementById(`${prefix}-name`)?.value || 'Nieuwe Auditor';
  const email = document.getElementById(`${prefix}-email`)?.value || 'auditor@example.com';
  const phone = document.getElementById(`${prefix}-phone`)?.value || '';
  const company = document.getElementById(`${prefix}-company`)?.value || '';
  const country = document.getElementById(`${prefix}-country`)?.value || 'Netherlands';
  const city = document.getElementById(`${prefix}-city`)?.value || 'Utrecht';

  // Gather categories
  const catBoxes = document.querySelectorAll(`input[name="${prefix}-cat"]:checked`);
  const categories = Array.from(catBoxes).map(cb => cb.value);
  const catStr = categories.length > 0 ? categories.join(', ') : 'HH';

  // Add to PARTIES_REQUESTS_DATA so Michael & Kelly see it arrive immediately
  if (typeof PARTIES_REQUESTS_DATA !== 'undefined') {
    PARTIES_REQUESTS_DATA.unshift({
      to: `${name} (${company || 'Lead Auditor'})`,
      type: 'auditor',
      whatAsked: `Aanmelding Lead Auditor (${catStr}) · Kwalificatiedossier`,
      sent: 'Vandaag',
      whereTheyAre: 'To check · Nieuwe aanvraag',
      due: 'Binnen 7 dagen',
      status: 'pending'
    });
  }

  // Also add to AUDITORS_DATA if available
  if (typeof AUDITORS_DATA !== 'undefined') {
    AUDITORS_DATA.unshift({
      id: `AUD-NEW-${Math.floor(Math.random() * 900) + 100}`,
      name: name,
      country: country,
      workArea: `${city} (+75 km)`,
      state: 'Applied · In review',
      contract: 'Pending signature',
      lastEvaluated: 'Nieuwe intake',
      legalHold: 'None',
      chainsBarred: document.getElementById(`${prefix}-barred`)?.value || 'None'
    });
  }

  // Close modal or return to auditors view
  if (prefix === 'modal') {
    closeAuditorRegistrationModal();
  }
  showAuditorsList();

  // Show celebratory feedback toast
  showToast(
    'Aanmelding succesvol ontvangen',
    `Dossier van ${name} is geregistreerd onder Requests (To check) en geplaatst in de auditor-wachtrij.`,
    'success'
  );
}

window.openAuditorRegistrationModal = openAuditorRegistrationModal;
window.closeAuditorRegistrationModal = closeAuditorRegistrationModal;
window.openAuditorPublicPortal = openAuditorPublicPortal;
window.handleAuditorRegistrationSubmit = handleAuditorRegistrationSubmit;

// Automatic hash routing for direct access (e.g. audit-independer.vercel.app/#aanmelden)
function checkAuditorHashRoute() {
  const hash = window.location.hash.toLowerCase();
  if (hash === '#aanmelden' || hash === '#auditor-registration' || hash === '#auditor-form') {
    openAuditorPublicPortal();
  }
}
window.addEventListener('DOMContentLoaded', checkAuditorHashRoute);
window.addEventListener('hashchange', checkAuditorHashRoute);
// Check immediately on script load as well
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  checkAuditorHashRoute();
}

