import { auth, db } from './firebase-init.js'; 
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc, addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let agendamentosGlobais = [];

// ==========================================
// SEGURANÇA DA TELA
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html'; 
    } else {
        const docRef = doc(db, "usuarios", user.uid);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists() || docSnap.data().tipo !== "admin") {
            alert("⛔ Acesso Negado!");
            signOut(auth).then(() => { window.location.href = 'login.html'; });
        }
    }
});

// ==========================================
// INICIANDO O CALENDÁRIO
// ==========================================
let calendar;
document.addEventListener('DOMContentLoaded', function() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'pt-br',
        height: 'auto',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listWeek'
        },
        events: [], 
        dateClick: function(info) { abrirModalDia(info.dateStr); },
        eventClick: function(info) {
            const dataPura = info.event.startStr.split('T')[0];
            abrirModalDia(dataPura);
        }
    });
    calendar.render();
});

// ==========================================
// RADAR GERAL: FINANCEIRO, CALENDÁRIO E HOJE
// ==========================================
const radarGeral = collection(db, "agendamentos");

onSnapshot(radarGeral, async (querySnapshot) => {
    let faturamentoMes = 0;
    const mesAtual = new Date().getMonth() + 1; 
    let eventosCalendario = [];
    agendamentosGlobais = []; 
    
    const containerAgendaHoje = document.getElementById('lista-agenda-hoje');
    containerAgendaHoje.innerHTML = '';
    const dataAtualString = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    let temHoje = false;

    const promessas = querySnapshot.docs.map(async (documento) => {
        const pedido = { id: documento.id, ...documento.data() };
        
        let nomeCliente = pedido.clienteNome || "Cliente";
        if (pedido.clienteId && !pedido.clienteNome) {
            const docCliente = await getDoc(doc(db, "usuarios", pedido.clienteId));
            if(docCliente.exists()) nomeCliente = docCliente.data().nome;
        }
        
        pedido.clienteNomePronto = nomeCliente; 
        agendamentosGlobais.push(pedido); 

        if (pedido.status === "Bloqueado") {
            eventosCalendario.push({
                title: `🚫 ${pedido.motivo}`,
                start: pedido.data,
                color: '#ff4c4c',
                allDay: true
            });
            return;
        }

        if (pedido.status === "Aprovado") {
            const mesPedido = parseInt(pedido.data.split('-')[1]);
            if (mesPedido === mesAtual) {
                faturamentoMes += parseInt(pedido.valorTotal || 0);
            }

            eventosCalendario.push({
                title: `${pedido.horario} - ${nomeCliente}`,
                start: `${pedido.data}T${pedido.horario}:00`,
                color: '#63bce5',
                textColor: '#061124'
            });

            if (pedido.data === dataAtualString) {
                temHoje = true;
                const cardHTML = `
                <div class="card-pedido-hoje">
                    <div class="info-pedido">
                        <h3>🕒 ${pedido.horario} - ${nomeCliente}</h3>
                        <p>💅 ${pedido.servico}</p>
                    </div>
                    <button class="btn-recusar" onclick="cancelarAprovado('${pedido.id}')">Liberar Horário</button>
                </div>`;
                containerAgendaHoje.innerHTML += cardHTML;
            }
        }
    });

    await Promise.all(promessas);

    document.getElementById('valor-caixa').innerText = `R$ ${faturamentoMes},00`;
    calendar.removeAllEvents();
    calendar.addEventSource(eventosCalendario);

    if (!temHoje) {
        containerAgendaHoje.innerHTML = '<p style="color: #63bce5;">Nenhum agendamento para hoje ainda.</p>';
    }
});


// ==========================================
// RADAR DE CANCELAMENTOS PELA CLIENTE 🚨
// ==========================================
const radarCancelados = query(collection(db, "agendamentos"), where("status", "==", "Cancelado pelo Cliente"));

onSnapshot(radarCancelados, async (querySnapshot) => {
    const sessaoCancelados = document.getElementById('sessao-cancelados');
    const listaCancelados = document.getElementById('lista-cancelados');
    listaCancelados.innerHTML = '';

    if (querySnapshot.empty) {
        // Se não tem cancelamento novo, esconde o radar pra não sujar a tela
        sessaoCancelados.style.display = 'none';
        return;
    }

    // Se tem, pisca a luz vermelha
    sessaoCancelados.style.display = 'block';
    
    const cancelados = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    for (const pedido of cancelados) {
        const dataBR = pedido.data.split('-').reverse().join('/');
        let nomeCliente = "Cliente";
        if (pedido.clienteId) {
            const docCliente = await getDoc(doc(db, "usuarios", pedido.clienteId));
            if(docCliente.exists()) nomeCliente = docCliente.data().nome;
        }

        listaCancelados.innerHTML += `
        <div class="card-pedido" style="border-left: 6px solid #ff4c4c; background: #2a1414;">
            <div class="info-pedido">
                <h3 style="color: #ff4c4c;">🚨 Cancelou: ${nomeCliente}</h3>
                <p style="color: #b0c4de;">💅 ${pedido.servico}</p>
                <p style="color: #b0c4de;">🗓️ O horário era dia ${dataBR} às <strong>${pedido.horario}</strong></p>
            </div>
            <div class="acoes-pedido">
                <button class="btn-recusar" style="background: #ff4c4c; color: white;" onclick="cienteCancelamento('${pedido.id}')">Estou Ciente / Limpar</button>
            </div>
        </div>`;
    }
});

window.cienteCancelamento = async function(idPedido) {
    // Muda pro status final, aí ele some do alerta e o horário fica livre
    await updateDoc(doc(db, "agendamentos", idPedido), { status: "Cancelado" });
}


// ==========================================
// FUNÇÕES DO MODAL DO DIA
// ==========================================
window.abrirModalDia = function(dataClicada) {
    const modal = document.getElementById('modal-dia-detalhe');
    const titulo = document.getElementById('titulo-modal-dia');
    const lista = document.getElementById('lista-detalhe-dia');

    const dataBR = dataClicada.split('-').reverse().join('/');
    titulo.innerText = `Agenda: ${dataBR}`;

    const filtrados = agendamentosGlobais.filter(ag => ag.data === dataClicada && (ag.status === "Aprovado" || ag.status === "Bloqueado"));

    lista.innerHTML = '';

    if (filtrados.length === 0) {
        lista.innerHTML = '<p style="color: #b0c4de; text-align: center;">Nenhum evento neste dia. Agenda livre!</p>';
    } else {
        filtrados.sort((a, b) => (a.horario || "24:00").localeCompare(b.horario || "24:00"));
        filtrados.forEach(ag => {
            if(ag.status === "Bloqueado") {
                lista.innerHTML += `
                    <div style="background: #2a1414; padding: 1rem; border-radius: 10px; margin-bottom: 1rem; border-left: 5px solid #ff4c4c;">
                        <h4 style="color: #ff4c4c;">🚫 DIA BLOQUEADO</h4>
                        <p style="color: #b0c4de;">Motivo: ${ag.motivo}</p>
                    </div>
                `;
            } else {
                lista.innerHTML += `
                    <div style="background: #142a4a; padding: 1rem; border-radius: 10px; margin-bottom: 1rem; border-left: 5px solid #63bce5;">
                        <h4 style="color: #fff;">🕒 ${ag.horario} - ${ag.clienteNomePronto}</h4>
                        <p style="color: #63bce5; font-weight: bold;">💅 ${ag.servico}</p>
                        <p style="color: #b0c4de; font-size: 0.9rem;">Valor: R$ ${ag.valorTotal},00</p>
                    </div>
                `;
            }
        });
    }

    modal.style.display = 'flex';
}

window.fecharModalDia = function() {
    document.getElementById('modal-dia-detalhe').style.display = 'none';
}


// ==========================================
// PENDENTES
// ==========================================
const containerPendentes = document.getElementById('lista-pendentes');
const radarPendentes = query(collection(db, "agendamentos"), where("status", "==", "Pendente"));

onSnapshot(radarPendentes, async (querySnapshot) => {
    containerPendentes.innerHTML = '';
    if (querySnapshot.empty) {
        containerPendentes.innerHTML = '<p style="color: #63bce5;">Nenhum pedido pendente. Tá suave!</p>';
        return;
    }

    const pedidos = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    for (const pedido of pedidos) {
        const dataBR = pedido.data.split('-').reverse().join('/');
        let nomeCliente = "Cliente";
        if (pedido.clienteId) {
            const docCliente = await getDoc(doc(db, "usuarios", pedido.clienteId));
            if(docCliente.exists()) nomeCliente = docCliente.data().nome;
        }

        containerPendentes.innerHTML += `
        <div class="card-pedido">
            <div class="info-pedido">
                <h3>💅 ${pedido.servico} - ${nomeCliente}</h3>
                <p>🗓️ ${dataBR} às <strong>${pedido.horario}</strong></p>
                <p>💰 Valor Total: R$ ${pedido.valorTotal},00</p>
            </div>
            <div class="acoes-pedido">
                <button class="btn-aprovar" onclick="aprovarPedido('${pedido.id}')">Aprovar</button>
                <button class="btn-recusar" onclick="recusarPedido('${pedido.id}')">Recusar</button>
            </div>
        </div>`;
    }
});

window.aprovarPedido = async function(id) { await updateDoc(doc(db, "agendamentos", id), { status: "Aprovado" }); }
window.recusarPedido = async function(id) { if(confirm("Certeza?")) await updateDoc(doc(db, "agendamentos", id), { status: "Recusado" }); }
window.cancelarAprovado = async function(id) { 
    if(confirm("Cancelar agendamento e liberar o horário?")) {
        await updateDoc(doc(db, "agendamentos", id), { status: "Cancelado" }); 
        fecharModalDia();
    }
}

// ==========================================
// FORMULÁRIOS
// ==========================================
document.getElementById('form-manual').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('manual-nome').value;
    const data = document.getElementById('manual-data').value;
    const hora = document.getElementById('manual-hora').value;
    const servicoSelect = document.getElementById('manual-servico');
    const servico = servicoSelect.value;
    
    let preco = 0;
    if (servico.includes('Alongamento')) preco = 150;
    else if (servico.includes('Banho')) preco = 80;
    else if (servico.includes('Manutenção')) preco = 70;

    try {
        await addDoc(collection(db, "agendamentos"), {
            clienteNome: nome,
            data: data,
            horario: hora,
            servico: servico,
            valorTotal: preco,
            status: "Aprovado",
            tipo: "Manual"
        });
        alert(`Agendamento de ${nome} criado!`);
        document.getElementById('form-manual').reset();
    } catch(erro) { alert("Erro ao agendar."); console.error(erro); }
});

document.getElementById('form-bloqueio').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = document.getElementById('bloqueio-data').value;
    const motivo = document.getElementById('bloqueio-motivo').value;

    try {
        await addDoc(collection(db, "agendamentos"), {
            data: data,
            motivo: motivo,
            status: "Bloqueado",
            tipo: "Bloqueio"
        });
        alert(`Data ${data} bloqueada com sucesso!`);
        document.getElementById('form-bloqueio').reset();
    } catch(erro) { alert("Erro ao bloquear."); console.error(erro); }
});

window.sairDoPainel = function() { signOut(auth).then(() => { window.location.href = 'login.html'; }); }