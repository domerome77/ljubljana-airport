import { HashRouter, Route, Routes } from 'react-router-dom';
import { getApi } from './api';
import { Landing } from './public/Landing';
import './styles/global.css';

const now = () => new Date().toISOString();

function DemoRibbon() {
  if (!getApi().isDemo) return null;
  return <div className="demo-ribbon" role="note">DEMO<span>test data · no real payments</span></div>;
}

export default function App() {
  const api = getApi();
  return (
    <HashRouter>
      <DemoRibbon />
      <Routes>
        <Route path="*" element={<Landing api={api} now={now} />} />
      </Routes>
    </HashRouter>
  );
}
