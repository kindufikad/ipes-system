import { cloneElement, isValidElement, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';
import { useTranslation } from '../context/useTranslation';

const DashboardLayout = ({
	role = 'depthead',
	subtitle,
	statsCards = [],
	children,
}) => {
	const { t } = useTranslation();
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
	const roleTitle = t(`roles.${role}`, t('roles.user'));
	const dashboardSubtitle = role === 'academic_vice_president'
		? t('vicePresidentDashboard.subtitle', subtitle)
		: subtitle;
	const hasMobileNavigation = role === 'depthead' || ['academic_directorate', 'academic_vice_president', 'college_dean', 'lab_assistant'].includes(role);
	const dashboardContent = role === 'depthead' && isValidElement(children)
		? cloneElement(children, { isMobileMenuOpen, setIsMobileMenuOpen })
		: children;

	return (
		<div className="flex min-h-screen w-full flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
			<Header isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} hasMobileNavigation={hasMobileNavigation} />

			<div className="flex min-h-[calc(100vh-4rem)] w-full flex-1 flex-col overflow-hidden pt-16 lg:flex-row">
				<Sidebar role={role} isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} />
				<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
					<main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">
						<div className="mx-auto flex w-full min-w-0 max-w-none flex-col gap-6 px-3 py-4 sm:px-4 lg:px-8 lg:py-8">
							{subtitle ? (
								<div className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900 sm:p-5">
									<p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-600">{roleTitle}</p>
									<p className="mt-2 text-sm text-slate-600">{dashboardSubtitle}</p>
								</div>
							) : null}

							{statsCards.length ? (
								<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
									{statsCards.map((card) => {
										const Icon = card.icon;
										return (
											<div key={card.title} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
												<div className="flex items-start justify-between gap-3">
													<div>
														<p className="text-sm font-medium text-slate-500">{card.title}</p>
														<p className="mt-3 text-2xl font-semibold text-slate-900">{card.value}</p>
													</div>
													<div className={`rounded-2xl p-2 ${card.iconClassName || 'bg-blue-50 text-blue-600'}`}>
														{Icon ? <Icon className="h-5 w-5" /> : null}
													</div>
												</div>
												{card.detail ? <p className="mt-3 text-sm text-slate-500">{card.detail}</p> : null}
											</div>
										);
									})}
								</div>
							) : null}

							<div className="min-w-0 space-y-6">{dashboardContent || <Outlet />}</div>
						</div>
					</main>
				</div>
			</div>
			<Footer />
		</div>
	);
};

export default DashboardLayout;

