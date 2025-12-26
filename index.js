const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

admin.initializeApp();
const db = admin.firestore();

/* =========================
   CONFIG E-MAIL (functions.config)
========================= */
const mailConfig = functions.config().mail || {};
const mailUser = mailConfig.user;
const mailPass = mailConfig.pass;

if (!mailUser || !mailPass) {
  console.log("⚠️ SMTP não configurado (mail.user / mail.pass).");
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: mailUser,
    pass: mailPass,
  },
});

/* =========================
   HELPERS DE DATA
========================= */
function getMesAnteriorRef() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return y + "-" + m; // YYYY-MM
}

function formatarMes(mesRef) {
  const partes = mesRef.split("-");
  const y = partes[0];
  const m = partes[1];

  const meses = [
    "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
  ];

  return meses[Number(m) - 1] + " " + y;
}

/* =========================
   BUSCAR EMAILS DOS ADMINS
========================= */
async function getAdminEmails() {
  const snap = await db
    .collection("users")
    .where("role", "==", "admin")
    .get();

  const emails = [];

  snap.forEach(doc => {
    const u = doc.data();
    if (u && u.email) {
      emails.push(u.email);
    }
  });

  return Array.from(new Set(emails));
}

/* =========================
   GERAR GRÁFICO PNG
========================= */
async function gerarGraficoPNG(totais) {
  const canvas = new ChartJSNodeCanvas({
    width: 900,
    height: 500,
    backgroundColour: "white",
  });

  const config = {
    type: "bar",
    data: {
      labels: [
        "Apresentação",
        "Treinamento",
        "Migração",
        "Parametrização",
      ],
      datasets: [
        {
          data: [
            totais.APRESENTACAO,
            totais.TREINAMENTO,
            totais.MIGRACAO,
            totais.PARAMETRIZACAO,
          ],
          backgroundColor: [
            "#22c55e",
            "#3b82f6",
            "#f59e0b",
            "#a855f7",
          ],
          borderRadius: 8,
        },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
        },
      },
    },
  };

  return canvas.renderToBuffer(config, "image/png");
}

/* =========================
   HTML DO RELATÓRIO
========================= */
function montarHTML({ mesLabel, porSuporte, totais }) {
  let html = `
    <div style="font-family:Arial">
      <h2>📊 Relatório Mensal de Atividades</h2>
      <p><b>Mês:</b> ${mesLabel}</p>

      <h3>Totais gerais</h3>
      <ul>
        <li>Apresentação: <b>${totais.APRESENTACAO}</b></li>
        <li>Treinamento: <b>${totais.TREINAMENTO}</b></li>
        <li>Migração: <b>${totais.MIGRACAO}</b></li>
        <li>Parametrização: <b>${totais.PARAMETRIZACAO}</b></li>
      </ul>

      <h3>Por suporte</h3>
  `;

  const suportes = Object.values(porSuporte);

  if (!suportes.length) {
    html += "<p>Nenhuma atividade registrada.</p>";
  } else {
    suportes.forEach(s => {
      html += `
        <h4>${s.nome || s.email || s.id}</h4>
        <ul>
          <li>Apresentação: ${s.APRESENTACAO}</li>
          <li>Treinamento: ${s.TREINAMENTO}</li>
          <li>Migração: ${s.MIGRACAO}</li>
          <li>Parametrização: ${s.PARAMETRIZACAO}</li>
        </ul>
      `;
    });
  }

  html += `
      <p style="font-size:12px;color:#666">
        Relatório gerado automaticamente – SupraTech
      </p>
    </div>
  `;

  return html;
}

/* =========================
   FUNÇÃO AGENDADA (DIA 1)
========================= */
exports.relatorioMensalAtividadesAdmins = functions.pubsub
  .schedule("0 9 1 * *")
  .timeZone("America/Sao_Paulo")
  .onRun(async () => {
    if (!mailUser || !mailPass) {
      console.log("❌ SMTP não configurado.");
      return null;
    }

    const mesRef = getMesAnteriorRef();
    const mesLabel = formatarMes(mesRef);

    const snap = await db
      .collection("atividades_suporte")
      .where("mesRef", "==", mesRef)
      .get();

    const totais = {
      APRESENTACAO: 0,
      TREINAMENTO: 0,
      MIGRACAO: 0,
      PARAMETRIZACAO: 0,
    };

    const porSuporte = {};

    snap.forEach(doc => {
      const a = doc.data();
      if (!a || !a.suporteId || !a.tipo) return;

      if (!a.clienteNome || !a.data) return;

      const tipo = String(a.tipo)
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      if (totais[tipo] === undefined) return;

      if (!porSuporte[a.suporteId]) {
        porSuporte[a.suporteId] = {
          id: a.suporteId,
          nome: a.suporteNome || "",
          email: a.suporteEmail || "",
          APRESENTACAO: 0,
          TREINAMENTO: 0,
          MIGRACAO: 0,
          PARAMETRIZACAO: 0,
        };
      }

      porSuporte[a.suporteId][tipo]++;
      totais[tipo]++;
    });

    const adminEmails = await getAdminEmails();
    if (!adminEmails.length) return null;

    const html = montarHTML({
      mesLabel,
      porSuporte,
      totais,
    });

    const grafico = await gerarGraficoPNG(totais);

    await transporter.sendMail({
      from: `SupraTech Relatórios <${mailUser}>`,
      to: adminEmails.join(","),
      subject: `📊 Resumo de Atividades – ${mesLabel}`,
      html,
      attachments: [
        {
          filename: `grafico-${mesRef}.png`,
          content: grafico,
        },
      ],
    });

    console.log("✅ Relatório mensal enviado:", adminEmails);
    return null;
  });
