import React from 'react';

export default function PredictionResult({ prediction, sourceLabel }) {
  return (
    <div className={`dropout-prediction-result${prediction.predictedDropout ? ' is-elevated' : ''}`}>
      {sourceLabel && <strong className="dropout-prediction-source">{sourceLabel}</strong>}
      <strong>
        {prediction.predictedDropout
          ? 'Additional student support may be helpful'
          : 'No elevated concern identified'}
      </strong>
      <span className="dropout-prediction-percentage">
        Estimated dropout probability: {(prediction.probability * 100).toFixed(1)}%
      </span>
      <p>{prediction.analysis}</p>
      {prediction.factors.length > 0 && (
        <ul className="dropout-prediction-factors">
          {prediction.factors.map((factor) => (
            <li key={factor.factor}>
              <strong>{factor.factor}</strong>
              <span>{factor.explanation}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="dropout-retention-plan">
        <h4>AI-suggested retention support plan</h4>
        <p>Discuss these options with the student and choose steps together:</p>
        <ol>
          {prediction.supportPlan.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </div>
    </div>
  );
}
