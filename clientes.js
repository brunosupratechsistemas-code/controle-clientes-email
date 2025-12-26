/* =========================
   CLIENTES
========================= */
let clientesCache = [];
let editingClientId = null;
const suporteCache = {};
let oldSuporteId = null;
let suporteFiltroAtivo = null;

import { session } from "./state.js";

import {
  collection,
  addDoc,
  doc,
  getDoc,          // 🔥 ADICIONAR ISSO
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  getDocs,
  writeBatch,
  where, 
  serverTimestamp
} from "./firebase-imports.js";


import { db, auth } from "./firebase-init.js";

import {
  draggedInfo,
  selectedCard,
  historyAll,
  historyFiltered,
  setDraggedInfo,
  setSelectedCard,
  setHistoryAll,
  setHistoryFiltered,
  setUnsubscribeRealtime,
  setPendingEmailData,
  setUnsubscribeHistory
} from "./state.js";

import {
  escapeHtml,
  fmtTS,
  fmtDateFromDoc,
  showLoading,
  hideLoading,
  containerByStatus
} from "./utils.js";

/* =========================
   ELEMENTOS
========================= */

const colEspera = document.getElementById("espera");
const colAgendado = document.getElementById("agendado");
const colFinalizado = document.getElementById("finalizado");

const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalTextarea = document.getElementById("modalTextarea");

const historyBody = document.getElementById("historyBody");
const historyCount = document.getElementById("historyCount");

window.openEditClientModal = async function (cliente) {
  editingClientId = cliente.id;
  oldSuporteId = cliente.suporteId || null; // 🔥 ESSENCIAL

  document.getElementById("editClientName").value = cliente.name || "";
  document.getElementById("editClientTelefone").value = cliente.telefone || "";

  const suporteSelect = document.getElementById("editClientSuporte");
  suporteSelect.innerHTML = `<option value="">Selecione o suporte</option>`;

  if (session?.isAdmin === true) {
    const snap = await getDocs(
      query(collection(db, "users"), where("role", "==", "suporte"))
    );

    snap.forEach(d => {
      const u = d.data();
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = u.name || u.email;

      if (d.id === cliente.suporteId) opt.selected = true;
      suporteSelect.appendChild(opt);
    });

    suporteSelect.style.display = "block";
  } else {
    suporteSelect.style.display = "none";
  }

  document.body.classList.add("modal-open");
  document.getElementById("modal-edit-client").style.display = "block";
};







window.closeEditClientModal = function () {
  editingClientId = null;
  document.getElementById("modal-edit-client").style.display = "none";
  document.body.classList.remove("modal-open");
};

/* =========================
   HISTÓRICO
========================= */

async function logHistorico(payload) {
  try {
    await addDoc(collection(db, "historico"), {
      ...payload,
      userId: auth.currentUser?.uid || null,
      userEmail: auth.currentUser?.email || null,
      createdAtClient: Date.now(), // 🔥 número, imediato
createdAt: serverTimestamp(),
updatedAt: serverTimestamp()

    });
  } catch {}
}

/* =========================
   KANBAN
========================= */

function createCard(data) {
let suporteNome = data.suporteNome || "";

if (!suporteNome && data.suporteId) {
  getDoc(doc(db, "users", data.suporteId)).then(snap => {
    if (snap.exists()) {
      suporteNome = snap.data().name || "";

      // força re-render apenas deste card
      card.querySelector(".client-support")?.remove();

      if (suporteNome) {
        const supEl = document.createElement("div");
        supEl.className = "client-support";
        supEl.innerText = `🛠 ${suporteNome}`;
        nameEl.appendChild(supEl);
      }
    }
  });
}



  const card = document.createElement("div");
  card.className = "client-card";
  card.draggable = true;
  card.dataset.id = data.id;

  const nameEl = document.createElement("div");
nameEl.className = "client-name";

nameEl.innerHTML = `
  <strong>${escapeHtml(data.name || "Sem nome")}</strong>

  ${data.telefone ? `
    <div class="client-phone">📞 ${escapeHtml(data.telefone)}</div>
  ` : ""}

  ${suporteNome ? `
    <div class="client-support">🛠 ${escapeHtml(suporteNome)}</div>
  ` : ""}
`;

  /* Duplo clique: editar nome */
  
nameEl.ondblclick = () => {
  window.openEditClientModal(data);
};

  const meta = document.createElement("div");
meta.className = "client-meta";

const dataFmt = fmtDateFromDoc(data);
const criadoPor = data.criadoPorNome || "Usuário";

meta.innerHTML = `
  🕒 ${dataFmt}
  <br>
  👤 ${escapeHtml(criadoPor)}
`;


  const editBtn = document.createElement("button");
  editBtn.className = "edit-btn";
  editBtn.textContent = "✏️";
  editBtn.onclick = e => {
    e.stopPropagation();
    openModal(card, data);
  };

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-btn";
  deleteBtn.textContent = "🗑";
deleteBtn.onclick = async e => {
  e.stopPropagation();

  // 🔐 SE NÃO FOR ADMIN
  if (!session?.isAdmin) {
    const ok = confirm(
      `Você não tem permissão para excluir.\nDeseja solicitar ao administrador a exclusão deste cliente?`
    );

    if (!ok) return;

    await solicitarExclusaoCliente(data);
    alert("Solicitação enviada ao administrador.");
    return;
  }

  // ✅ ADMIN EXCLUI NORMAL
  if (!confirm(`Excluir "${data.name}"?`)) return;

  showLoading("Excluindo cliente...");

  await deleteDoc(doc(db, "clientes", data.id));

  await logHistorico({
    clienteId: data.id,
    clienteNome: data.name,
    acao: "EXCLUIU"
  });

  hideLoading();
};

// TOOLTIP (observações)
if (data.observation && data.observation.trim()) {
  const tooltip = document.createElement("div");
  tooltip.className = "tooltip";
  tooltip.innerText = data.observation;
  card.appendChild(tooltip);
}

  card.addEventListener("dragstart", () => {
    setDraggedInfo({
      id: data.id,
      name: nameEl.textContent,
      from: card.parentElement?.id || ""
    });
    card.classList.add("dragging");
  });

  card.addEventListener("dragend", () => {
    setDraggedInfo(null);
    card.classList.remove("dragging");
  });

  card.append(nameEl, meta, editBtn, deleteBtn);
  return card;
}

function renderClients(list) {
  colEspera.innerHTML = "";
  colAgendado.innerHTML = "";
  colFinalizado.innerHTML = "";

  const cols = {
    espera: colEspera,
    agendado: colAgendado,
    finalizado: colFinalizado
  };

  list.forEach(data => {
    const card = createCard(data);
    containerByStatus(data.status || "espera", cols).appendChild(card);
  });
}


/* =========================
   DRAG & DROP
========================= */

document.querySelectorAll(".card-container").forEach(container => {
  container.addEventListener("dragover", e => e.preventDefault());

  container.addEventListener("drop", async () => {
    if (!draggedInfo?.id) return;

    const para = container.id;
    if (draggedInfo.from === para) return;

    await updateDoc(doc(db, "clientes", draggedInfo.id), {
      status: para,
      updatedAt: serverTimestamp()
    });

    await logHistorico({
      clienteId: draggedInfo.id,
      clienteNome: draggedInfo.name,
      acao: "MOVEU_STATUS",
      de: draggedInfo.from,
      para
    });
  });
});

/* =========================
   MODAL OBSERVAÇÃO
========================= */

function openModal(card, data) {
  setSelectedCard({ el: card, id: data.id });

  modalTitle.innerText = "Observações - " + (data.name || "");

const phoneEl = document.getElementById("modalClientPhone");
if (phoneEl) {
  phoneEl.innerText = data.telefone ? `📞 ${data.telefone}` : "";
}

modalTextarea.value = data.observation || "";
modal.style.display = "block";


  loadObsMeta(data);
}


export function closeModal() {
  modal.style.display = "none";
}

export async function saveObservation() {
  if (!selectedCard?.id) return;

  showLoading("Salvando observações...");

  await updateDoc(doc(db, "clientes", selectedCard.id), {
    observation: modalTextarea.value,
    updatedAt: serverTimestamp()
  });

  await logHistorico({
    clienteId: selectedCard.id,
    clienteNome:
      selectedCard.el.querySelector(".client-name")?.innerText || "",
    acao: "EDITOU_OBSERVACAO"
  });

  closeModal();
  hideLoading();
}

/* =========================
   REALTIME
========================= */

export function startRealtimeClientes() {
  const q = query(
    collection(db, "clientes"),
    orderBy("createdAt", "desc")
  );

onSnapshot(q, snapshot => {
  const list = [];
  const userId = auth.currentUser?.uid;
  const isAdmin = session?.isAdmin === true;

  snapshot.forEach(docSnap => {
    const data = { id: docSnap.id, ...docSnap.data() };

    const isSuporteResponsavel =
      data.suporteId && data.suporteId === userId;

    if (isAdmin || isSuporteResponsavel) {
      list.push(data);
    }
  });

  clientesCache = [...list];
aplicarFiltroKanban(); // 🔥 respeita filtro ativo

});

}



/* =========================
   HISTÓRICO REALTIME (ADMIN)
========================= */

export function startHistoryRealtime() {
  const qh = query(
    collection(db, "historico"),
    orderBy("createdAt", "desc"),
    limit(500)
  );

  const unsub = onSnapshot(qh, snap => {
    const all = [];
    snap.forEach(d => all.push({ id: d.id, ...d.data() }));
    setHistoryAll(all);
    setHistoryFiltered([...all]);
    renderHistory(historyFiltered);
  });

  setUnsubscribeHistory(unsub);
}

function renderHistory(list) {
  if (!historyBody) return;

  if (!list.length) {
    historyBody.innerHTML =
      `<tr><td colspan="6" style="text-align:center;opacity:.7">Sem registros</td></tr>`;
    if (historyCount) historyCount.innerText = "0 registros";
    return;
  }

  historyBody.innerHTML = list.map(h => `
    <tr>
      <td>${escapeHtml(fmtTS(h.createdAt))}</td>
      <td>${escapeHtml(h.acao || "")}</td>
      <td>${escapeHtml(h.clienteNome || "")}</td>
      <td>${escapeHtml(h.de || "")}</td>
      <td>${escapeHtml(h.para || "")}</td>
      <td>${escapeHtml(h.userEmail || "")}</td>
    </tr>
  `).join("");

  if (historyCount) historyCount.innerText = `${list.length} registro(s)`;
}

async function loadObsMeta(cliente) {
  const metaCard = document.getElementById("obs-meta-card");
  if (!metaCard) return;

  // 🔥 sempre esconder antes
  metaCard.style.display = "none";

  const userId = auth.currentUser?.uid;

  const isAdmin = session?.isAdmin === true;
  const isSuporteResponsavel =
    cliente.suporteId &&
    cliente.suporteId === userId;

  /* 🔐 REGRA FINAL */
  if (!isAdmin && !isSuporteResponsavel) {
    return; // 🚫 não mostra nada
  }

  try {
    /* =====================
       CONTABILIDADE
    ===================== */
    let contNome = "-";
    let contTelefone = "-";

    if (cliente.contabilidadeId) {
      const contSnap = await getDoc(
        doc(db, "contabilidades", cliente.contabilidadeId)
      );

      if (contSnap.exists()) {
        const c = contSnap.data();
        contNome = c.nome || "-";
        contTelefone = c.telefone || "-";
      }
    }

    /* =====================
       SUPORTE
    ===================== */
    let suporteNome = "-";

    if (cliente.suporteId) {
      const supSnap = await getDoc(
        doc(db, "users", cliente.suporteId)
      );

      if (supSnap.exists()) {
        suporteNome = supSnap.data().name || "-";
      }
    }

    /* =====================
       UI
    ===================== */
    document.getElementById("obs-cont-nome").innerText = contNome;
    document.getElementById("obs-cont-telefone").innerText = contTelefone;
    document.getElementById("obs-suporte-nome").innerText = suporteNome;

    metaCard.style.display = "flex";

  } catch (err) {
    console.error("Erro ao carregar meta da observação", err);
    metaCard.style.display = "none";
  }
}


const searchInput = document.getElementById("searchClient");

if (searchInput) {
  searchInput.addEventListener("input", e => {
    const term = e.target.value.toLowerCase().trim();

    if (!term) {
      renderClients(clientesCache);
      return;
    }

    const filtered = clientesCache.filter(c =>
      (c.name || "").toLowerCase().includes(term) ||
      (c.telefone || "").toLowerCase().includes(term)
    );

    renderClients(filtered);
  });
}


window.saveEditClient = async function () {
  if (!editingClientId) return;

  const name = editClientName.value.trim();
  const telefone = editClientTelefone.value.trim();
  const newSuporteId = editClientSuporte.value || null;

  showLoading("Salvando alterações...");

  try {
    await updateDoc(doc(db, "clientes", editingClientId), {
      name,
      telefone,
      suporteId: newSuporteId,
      updatedAt: serverTimestamp()
    });
// 🔥 SE TROCOU SUPORTE
if (session?.isAdmin && newSuporteId !== oldSuporteId) {

  // 🔔 NOTIFICAÇÃO INTERNA (NOVO SUPORTE)
  try {
    await addDoc(collection(db, "notificacoes"), {
      tipo: "TROCA_SUPORTE",
      clienteId: editingClientId,
      clienteNome: name,
      suporteId: newSuporteId,
      createdAt: serverTimestamp(),
      lida: false
    });
  } catch (e) {
    console.warn("⚠️ Falha ao criar notificação interna", e);
  }

  // 📧 PREPARA ENVIO DE E-MAIL
setPendingEmailData({
  clienteId: editingClientId,
  clienteNome: name,
  clienteTelefone: telefone,
  suporteId: newSuporteId
});


  oldSuporteId = newSuporteId;

  hideLoading();            // 🔥 fecha loading
  openConfirmEmailModal();  // 🔥 abre confirmação
  return;
}


    closeEditClientModal();
  } catch (e) {
    console.error(e);
    alert("Erro ao salvar");
  } finally {
    hideLoading();
  }
};

async function solicitarExclusaoCliente(cliente) {
  try {
    showLoading("Solicitando exclusão...");

    // 🔐 Segurança extra
    if (!session?.user?.uid) {
      alert("Usuário não autenticado");
      return;
    }

    const motivo = prompt(
      "Informe o motivo da solicitação de exclusão:"
    );

    if (!motivo || !motivo.trim()) {
      alert("Motivo é obrigatório");
      return;
    }

    // 🔥 CRIA SOLICITAÇÃO
await addDoc(collection(db, "solicitacoes_exclusao"), {
  clienteId: cliente.id,
  clienteNome: cliente.name,
  motivo: motivo.trim(),
  solicitadoPor: session.user.uid,
  solicitadoPorNome: session.user.name || "Suporte",
  solicitadoPorEmail: session.user.email || "",
  status: "PENDENTE",
  createdAt: serverTimestamp()
});


    // 🔔 NOTIFICA ADMIN
await addDoc(collection(db, "notificacoes_admin"), {
  tipo: "SOLICITACAO_EXCLUSAO",
  clienteId: cliente.id,
  clienteNome: cliente.name,
  solicitadoPor: session.user.uid,
  solicitadoPorNome:
    session.user.name ||
    session.user.displayName ||
    session.user.email,
  solicitadoPorEmail: session.user.email || "",
  lida: false,
  createdAt: serverTimestamp()
});


  } catch (err) {
    console.error("Erro ao solicitar exclusão", err);
    alert("Erro ao solicitar exclusão");
  } finally {
    hideLoading();
  }
}

export async function loadSuporteFilter() {
  const sel = document.getElementById("filterSuporte");
  if (!sel) return;

  sel.innerHTML = `<option value="">🔎 Todos os suportes</option>`;

  const snap = await getDocs(collection(db, "users"));

  snap.forEach(d => {
    const u = d.data();
    if (u.role !== "admin") {
      sel.innerHTML += `
        <option value="${d.id}">
          ${u.name || u.email}
        </option>
      `;
    }
  });
}
const filtroSuporte = document.getElementById("filterSuporte");

if (filtroSuporte) {
  filtroSuporte.addEventListener("change", () => {
    suporteFiltroAtivo = filtroSuporte.value || null;

    aplicarFiltroKanban();
  });
}
function aplicarFiltroKanban() {
  if (!suporteFiltroAtivo) {
    renderClients(clientesCache);
    return;
  }

  const filtrados = clientesCache.filter(
    c => c.suporteId === suporteFiltroAtivo
  );

  renderClients(filtrados);
}

