import { Link } from 'react-router-dom'
import { ApplicationFrame } from '../components/layout/ApplicationFrame'

export function NotFoundPage() {
  return <ApplicationFrame><section className="not-found"><p className="mono">404</p><h1>Страница не найдена</h1><p>Проверьте адрес или вернитесь ко входу в лабораторию.</p><Link to="/login" className="secondary-action">Ко входу</Link></section></ApplicationFrame>
}
