import { AgentSwarmPage } from './AgentSwarmPage';

export function MissionPlannerPage({ latitude, longitude }: { latitude: number; longitude: number }) {
  return <AgentSwarmPage latitude={latitude} longitude={longitude} />;
}

