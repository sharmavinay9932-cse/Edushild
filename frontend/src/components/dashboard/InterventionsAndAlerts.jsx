import React from 'react';
import { ArrowRight, BellRing, CalendarClock, CircleCheck, Clock3 } from 'lucide-react';

const statusIcons = {
  Pending: Clock3,
  'In Progress': CalendarClock,
  Completed: CircleCheck,
};

export function RecentInterventions({ interventions }) {
  return (
    <section className="panel activity-panel">
      <div className="panel-heading">
        <div>
          <h2>Recent interventions</h2>
          <p>Latest support activity</p>
        </div>
        <button className="text-link" type="button">View all <ArrowRight size={14} /></button>
      </div>
      <div className="intervention-list">
        {interventions.map((item) => {
          const StatusIcon = statusIcons[item.status];
          return (
            <article className="intervention-item" key={`${item.title}-${item.student}`}>
              <div className="intervention-mark"><CalendarClock size={17} aria-hidden="true" /></div>
              <div className="intervention-copy">
                <strong>{item.title}</strong>
                <span>{item.student} <i /> {item.date}</span>
              </div>
              <span className={`intervention-status status-${item.status.toLowerCase().replace(' ', '-')}`}>
                <StatusIcon size={13} aria-hidden="true" />{item.status}
              </span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function AlertsPanel({ alerts, onReview }) {
  return (
    <section className="panel alerts-panel">
      <div className="panel-heading">
        <div className="alerts-title">
          <span className="alerts-heading-icon"><BellRing size={16} aria-hidden="true" /></span>
          <div>
            <h2>Needs staff review</h2>
            <p>{alerts.length} students need a closer look</p>
          </div>
        </div>
        <span className="alert-count">{alerts.length}</span>
      </div>
      <div className="alerts-list">
        {alerts.map((alert) => (
          <button className="alert-item" type="button" key={alert.student} onClick={() => onReview(alert.student)}>
            <span className="alert-avatar">{alert.initials}</span>
            <span className="alert-copy">
              <strong>{alert.student}</strong>
              <span>{alert.detail}</span>
            </span>
            <ArrowRight className="alert-arrow" size={15} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
