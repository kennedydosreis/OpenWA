import { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useTicketsQuery,
  useAssignTicketMutation,
  useResolveTicketMutation,
  useTicketMessagesQuery,
  useSendTicketMessageMutation,
} from '../hooks/queries';
import type { AttendanceTicket, Message } from '../services/api';
import './Attendance.css';

type FilterStatus = 'all' | 'waiting' | 'in_progress' | 'resolved';

export function Attendance() {
  const { t } = useTranslation();
  const [filterQueue, setFilterQueue] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [assignModal, setAssignModal] = useState<{
    open: boolean;
    ticketId: string;
  }>({ open: false, ticketId: '' });
  const [attendantName, setAttendantName] = useState('');
  const [chatTicket, setChatTicket] = useState<AttendanceTicket | null>(null);
  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: tickets, isLoading, error } = useTicketsQuery({
    queue: filterQueue !== 'all' ? filterQueue : undefined,
    status: filterStatus !== 'all' ? filterStatus : undefined,
  });

  const assignMutation = useAssignTicketMutation();
  const resolveMutation = useResolveTicketMutation();
  const sendMessageMutation = useSendTicketMessageMutation();

  // Filter out resolved by default when filter is 'all'
  const visibleTickets = useMemo(() => {
    if (!tickets) return [];
    if (filterStatus === 'all') {
      return tickets.filter((t: AttendanceTicket) => t.status !== 'resolved');
    }
    return tickets;
  }, [tickets, filterStatus]);

  // Messages for active chat
  const messagesQuery = useTicketMessagesQuery(
    chatTicket?.sessionId ?? '',
    chatTicket?.chatId ?? '',
    !!chatTicket,
  );

  const messages = messagesQuery.data?.messages ?? [];

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Split tickets by queue
  const { emprestimoTickets, cabGeralTickets } = useMemo(() => {
    return {
      emprestimoTickets: visibleTickets.filter((t: AttendanceTicket) => t.queue === 'emprestimo'),
      cabGeralTickets: visibleTickets.filter((t: AttendanceTicket) => t.queue === 'cab-geral'),
    };
  }, [visibleTickets]);

  const handleAssignClick = (ticketId: string) => {
    setAssignModal({ open: true, ticketId });
    setAttendantName('');
  };

  const confirmAssign = () => {
    if (!attendantName.trim() || !assignModal.ticketId) return;
    assignMutation.mutate(
      { id: assignModal.ticketId, assignedTo: attendantName },
      {
        onSuccess: () => {
          setAssignModal({ open: false, ticketId: '' });
          const ticket = visibleTickets.find((t: AttendanceTicket) => t.id === assignModal.ticketId);
          if (ticket) setChatTicket(ticket);
        },
      },
    );
  };

  const handleResolve = (ticketId: string) => {
    resolveMutation.mutate(ticketId, {
      onSuccess: () => {
        if (chatTicket?.id === ticketId) {
          setChatTicket(null);
          setChatInput('');
        }
      },
    });
  };

  const openChat = (ticket: AttendanceTicket) => {
    if (ticket.status === 'in_progress') {
      setChatTicket(ticket);
      setChatInput('');
    }
  };

  const closeChat = () => {
    setChatTicket(null);
    setChatInput('');
  };

  const sendChatMessage = () => {
    if (!chatInput.trim() || !chatTicket) return;
    sendMessageMutation.mutate(
      {
        sessionId: chatTicket.sessionId,
        chatId: chatTicket.chatId,
        text: chatInput.trim(),
      },
      {
        onSuccess: () => setChatInput(''),
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  // Counts (exclude resolved from stats)
  const totalWaiting = visibleTickets.filter((t: AttendanceTicket) => t.status === 'waiting').length;
  const totalInProgress = visibleTickets.filter((t: AttendanceTicket) => t.status === 'in_progress').length;
  const totalToday = visibleTickets.length;

  const priorityLabel = (p: string) => {
    const map: Record<string, string> = {
      urgente: t('attendance.priorityUrgent', 'Urgente'),
      alta: t('attendance.priorityHigh', 'Alta'),
      media: t('attendance.priorityMedium', 'Média'),
      baixa: t('attendance.priorityLow', 'Baixa'),
    };
    return map[p] ?? p;
  };

  const formatMessageTime = (msg: Message) => {
    const ts = msg.timestamp ?? new Date(msg.createdAt).getTime();
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderTicket = (ticket: AttendanceTicket) => (
    <div
      key={ticket.id}
      className={`ticket-card ${ticket.priority} ${ticket.status === 'in_progress' ? 'clickable' : ''}`}
      onClick={() => openChat(ticket)}
    >
      <div className="ticket-card-header">
        <span className="ticket-customer-name">
          {ticket.customerName || ticket.customerPhone}
        </span>
        <span className={`ticket-priority-badge ${ticket.priority}`}>
          {priorityLabel(ticket.priority)}
        </span>
      </div>
      <div className="ticket-info">
        {ticket.customerPhone} {ticket.customerName ? `· ${ticket.customerName}` : ''}
      </div>
      {ticket.lastMessage && (
        <div className="ticket-last-message">{ticket.lastMessage}</div>
      )}
      <div className="ticket-time">
        <span>
          {new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span>{ticket.assignedTo ?? ''}</span>
      </div>
      {ticket.status === 'waiting' && (
        <div className="ticket-actions">
          <button className="btn-assign" onClick={(e) => { e.stopPropagation(); handleAssignClick(ticket.id); }}>
            {t('attendance.assign', 'Atender')}
          </button>
        </div>
      )}
      {ticket.status === 'in_progress' && (
        <div className="ticket-actions">
          <button className="btn-resolve" onClick={(e) => { e.stopPropagation(); handleResolve(ticket.id); }}>
            {t('attendance.resolve', 'Resolver')}
          </button>
        </div>
      )}
    </div>
  );

  if (error) {
    return (
      <div className="attendance-page">
        <div className="attendance-empty">
          {t('attendance.error', 'Erro ao carregar tickets')}
        </div>
      </div>
    );
  }

  return (
    <div className="attendance-page">
      <h1>{t('nav.attendance', 'Atendimento')}</h1>

      {/* Stats */}
      <div className="attendance-stats">
        <div className="attendance-stat-box">
          <div className="stat-number">{totalWaiting}</div>
          <div className="stat-label">{t('attendance.waiting', 'Aguardando')}</div>
        </div>
        <div className="attendance-stat-box">
          <div className="stat-number">{totalInProgress}</div>
          <div className="stat-label">{t('attendance.inProgress', 'Em Atendimento')}</div>
        </div>
        <div className="attendance-stat-box">
          <div className="stat-number">{totalToday}</div>
          <div className="stat-label">{t('attendance.total', 'Total')}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="attendance-filters">
        <select value={filterQueue} onChange={e => setFilterQueue(e.target.value)}>
          <option value="all">{t('attendance.allQueues', 'Todas as filas')}</option>
          <option value="emprestimo">{t('attendance.queueEmprestimo', 'Empréstimo')}</option>
          <option value="cab-geral">{t('attendance.queueCabGeral', 'CAB Geral')}</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as FilterStatus)}>
          <option value="all">{t('attendance.allStatuses', 'Ativos')}</option>
          <option value="waiting">{t('attendance.waiting', 'Aguardando')}</option>
          <option value="in_progress">{t('attendance.inProgress', 'Em Atendimento')}</option>
          <option value="resolved">{t('attendance.resolved', 'Resolvidos')}</option>
        </select>
      </div>

      {/* Queue Columns */}
      {isLoading ? (
        <div className="attendance-loading">{t('common.loading', 'Carregando...')}</div>
      ) : (
        <div className="attendance-columns">
          {/* CAB Geral */}
          <div className="attendance-column">
            <div className="column-header">
              <h2>{t('attendance.queueCabGeral', 'CAB Geral')}</h2>
              <span className="column-count">{cabGeralTickets.length}</span>
            </div>
            <div className="ticket-list">
              {cabGeralTickets.length === 0 ? (
                <div className="attendance-empty">
                  {t('attendance.noTickets', 'Nenhum ticket')}
                </div>
              ) : (
                cabGeralTickets.map(renderTicket)
              )}
            </div>
          </div>

          {/* Empréstimo */}
          <div className="attendance-column">
            <div className="column-header">
              <h2>{t('attendance.queueEmprestimo', 'Empréstimo')}</h2>
              <span className="column-count">{emprestimoTickets.length}</span>
            </div>
            <div className="ticket-list">
              {emprestimoTickets.length === 0 ? (
                <div className="attendance-empty">
                  {t('attendance.noTickets', 'Nenhum ticket')}
                </div>
              ) : (
                emprestimoTickets.map(renderTicket)
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chat Panel */}
      {chatTicket && (
        <div className="chat-panel-overlay" onClick={closeChat}>
          <div className="chat-panel" onClick={e => e.stopPropagation()}>
            <div className="chat-header">
              <div className="chat-header-info">
                <span className="chat-customer-name">{chatTicket.customerName || chatTicket.customerPhone}</span>
                <span className="chat-customer-phone">{chatTicket.customerPhone}</span>
              </div>
              <div className="chat-header-actions">
                <button className="btn-resolve-header" onClick={() => handleResolve(chatTicket.id)}>
                  {t('attendance.resolve', 'Resolver')}
                </button>
                <button className="btn-close-chat" onClick={closeChat}>✕</button>
              </div>
            </div>

            <div className="chat-messages">
              {messagesQuery.isLoading && (
                <div className="chat-loading">{t('common.loading', 'Carregando...')}</div>
              )}
              {messagesQuery.isError && (
                <div className="chat-error">{t('attendance.error', 'Erro ao carregar mensagens')}</div>
              )}
              {[...messages].reverse().map((msg: Message) => (
                <div
                  key={msg.id}
                  className={`chat-message ${msg.direction === 'outgoing' ? 'outgoing' : 'incoming'}`}
                >
                  <div className="chat-message-bubble">
                    <div className="chat-message-text">{msg.body}</div>
                    <div className="chat-message-time">{formatMessageTime(msg)}</div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-area">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('attendance.typeMessage', 'Digite sua mensagem...')}
                disabled={sendMessageMutation.isPending}
              />
              <button
                onClick={sendChatMessage}
                disabled={!chatInput.trim() || sendMessageMutation.isPending}
              >
                {sendMessageMutation.isPending ? '...' : t('attendance.send', 'Enviar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {assignModal.open && (
        <div className="assign-modal-overlay" onClick={() => setAssignModal({ open: false, ticketId: '' })}>
          <div className="assign-modal" onClick={e => e.stopPropagation()}>
            <h3>{t('attendance.assign', 'Atender')}</h3>
            <input
              type="text"
              placeholder={t('attendance.attendantName', 'Nome do atendente')}
              value={attendantName}
              onChange={e => setAttendantName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmAssign()}
              autoFocus
            />
            <div className="assign-modal-actions">
              <button
                className="btn-cancel"
                onClick={() => setAssignModal({ open: false, ticketId: '' })}
              >
                {t('common.cancel', 'Cancelar')}
              </button>
              <button
                className="btn-confirm"
                onClick={confirmAssign}
                disabled={!attendantName.trim() || assignMutation.isPending}
              >
                {t('common.confirm', 'Confirmar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
