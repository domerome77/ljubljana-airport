import { HashRouter, Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import { getApi } from './api';
import { BookingResult } from './public/BookingResult';
import { Landing } from './public/Landing';
import { AdminApp } from './staff/admin/AdminApp';
import { DeskPage } from './staff/desk/DeskPage';
import './styles/global.css';

const now = () => new Date().toISOString();

function DemoRibbon() {
  if (!getApi().isDemo) return null;
  return <div className="demo-ribbon no-print" role="note">DEMO<span>test data · no real payments</span></div>;
}

function BookingRoute() {
  const { id = '' } = useParams();
  const [q] = useSearchParams();
  return <BookingResult api={getApi()} id={id} token={q.get('t') ?? ''} demo={getApi().isDemo && q.get('demo') === 'pay'} />;
}

export default function App() {
  const api = getApi();
  return (
    <HashRouter>
      <DemoRibbon />
      <Routes>
        <Route path="/booking/:id" element={<BookingRoute />} />
        <Route path="/admin/*" element={<AdminApp api={api} now={now} />} />
        <Route path="/desk" element={<DeskPage api={api} now={now} />} />
        <Route path="*" element={<Landing api={api} now={now} />} />
      </Routes>
    </HashRouter>
  );
}
