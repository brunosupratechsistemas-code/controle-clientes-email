import { db } from "./firebase-init.js";
import {
  collection,
  query,
  onSnapshot,
  where,
  getDocs
} from "./firebase-imports.js";

let atividadesAdminCache = [];
let suporteSelecionado = "";

/* =========================
   INICIAR RESUMO ADMIN
========================= */
let unsubResumoAdmin = null;
let resumoChart = null;

export function startResumoAtividadesAdmin() {
  if (unsubResumoAdmin) unsubResumoAdmin();

  const q = query(collection(db, "atividades_suporte"));

  unsubResumoAdmin = onSnapshot(q, snap => {
    atividadesAdminCache = snap.docs.map(d => d.data());
      atualizarResumoAdmin();
  });
}

export function stopResumoAtividadesAdmin() {
  if (unsubResumoAdmin) {
    unsubResumoAdmin();
    unsubResumoAdmin = null;
  }
}

function atualizarResumoAdmin() {
  gerarResumoAdmin();
}

/* =========================
   GERAR TABELA
========================= */
function gerarResumoAdmin() {
  const body = document.getElementById("admin-resumo-body");
  const footer = document.getElementById("admin-resumo-footer");

  if (!body || !footer) return;

  body.innerHTML = "";
  footer.innerHTML = "";

  const resumo = {};
  const totais = {
    APRESENTACAO: 0,
    TREINAMENTO: 0,
    MIGRACAO: 0,
    PARAMETRIZACAO: 0
  };
atividadesAdminCache.forEach(a => {
  if (!a.mesRef || !a.tipo) return;

  if (suporteSelecionado && a.suporteId !== suporteSelecionado) return;

  const tipo = String(a.tipo)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (!resumo[a.mesRef]) {
    resumo[a.mesRef] = {
      APRESENTACAO: 0,
      TREINAMENTO: 0,
      MIGRACAO: 0,
      PARAMETRIZACAO: 0
    };
  }

if (resumo[a.mesRef][tipo] === undefined) return;

  resumo[a.mesRef][tipo]++;
  totais[tipo]++;
});

  const meses = Object.keys(resumo).sort();

 if (!meses.length) {
  body.innerHTML = `
    <tr>
      <td colspan="5" style="text-align:center;opacity:.7;padding:12px;">
        Nenhuma atividade registrada
      </td>
    </tr>
  `;

  // 🔥 ZERA O GRÁFICO
  renderResumoChart({
    APRESENTACAO: 0,
    TREINAMENTO: 0,
    MIGRACAO: 0,
    PARAMETRIZACAO: 0
  });

  return;
}


  meses.forEach(mes => {
    const r = resumo[mes];
    body.innerHTML += `
      <tr>
        <td>${formatarMes(mes)}</td>
        <td>${r.APRESENTACAO}</td>
        <td>${r.TREINAMENTO}</td>
        <td>${r.MIGRACAO}</td>
        <td>${r.PARAMETRIZACAO}</td>
      </tr>
    `;
  });

  footer.innerHTML = `
    <tr class="total-row">
      <td><strong>TOTAL</strong></td>
      <td>${totais.APRESENTACAO}</td>
      <td>${totais.TREINAMENTO}</td>
      <td>${totais.MIGRACAO}</td>
      <td>${totais.PARAMETRIZACAO}</td>
    </tr>
  `;
console.log("Filtro:", suporteSelecionado);
console.log("Totais do gráfico:", totais);

  renderResumoChart(totais);

}

/* =========================
   FILTRO SUPORTE
========================= */
export async function loadResumoSuportesAdmin() {
  const select = document.getElementById("adminResumoSuporte");
  if (!select) return;

  select.innerHTML = `<option value="">👥 Todos os suportes</option>`;

  const snap = await getDocs(
    query(collection(db, "users"), where("role", "==", "suporte"))
  );

  snap.forEach(d => {
    const u = d.data();
    select.innerHTML += `
      <option value="${d.id}">
        ${u.name || u.email}
      </option>
    `;
  });

  select.onchange = e => {
    suporteSelecionado = e.target.value;
    atualizarResumoAdmin();
  };
}

/* =========================
   UTIL
========================= */
function formatarMes(mesRef) {
  const [y, m] = mesRef.split("-");
  const meses = [
    "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
  ];
  return `${meses[Number(m)-1]} ${y}`;
}



function renderResumoChart(totais) {
  const canvas = document.getElementById("adminResumoChart");
  if (!canvas) return;

  if (resumoChart) {
    resumoChart.destroy();
  }

  resumoChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: [
        "Apresentação",
        "Treinamento",
        "Migração",
        "Parametrização"
      ],
      datasets: [{
        data: [
          totais.APRESENTACAO,
          totais.TREINAMENTO,
          totais.MIGRACAO,
          totais.PARAMETRIZACAO
        ],
        backgroundColor: [
          "#4ade80",
          "#60a5fa",
          "#fbbf24",
          "#a78bfa"
        ],
        borderRadius: 8
      }]
    },
options: {
  plugins: {
    legend: { display: false }
  },
  scales: {
    x: {
      ticks: {
        color: "#ffffff",   // 🔤 texto do eixo X
        font: {
          size: 13,
          weight: "500"
        }
      },
      grid: {
        color: "rgba(255,255,255,0.08)" // linhas verticais
      }
    },
    y: {
      beginAtZero: true,
      ticks: {
        color: "rgba(255,255,255,0.85)",
        precision: 0,
        font: {
          size: 12
        }
      },
      grid: {
        color: "rgba(255,255,255,0.08)" // linhas horizontais
      }
    }
  }
}

  });
}
