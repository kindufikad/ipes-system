import { Outlet } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const PublicLayout = () => (
  <div className="min-h-screen flex flex-col bg-white text-black dark:bg-slate-950 dark:text-slate-100">
    <Navbar />
    <main className="flex-grow">
      <Outlet />
    </main>
    <Footer />
  </div>
);

export default PublicLayout;
