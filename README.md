# Modelación y Filtrado de Tráfico en Redes | Dashboard CUN

Dashboard interactivo para el análisis y modelación de tráfico en redes utilizando transformadas de Fourier y filtros digitales IIR.

## 📋 Descripción

Este proyecto fue desarrollado para la **Corporación Unificada Nacional de Educación Superior (CUN)** en el curso de **Matemáticas Especiales**. Implementa un sistema DSP (Digital Signal Processing) completo con:

- **Análisis de Fourier**: Transformada de Fourier rápida (FFT) para análisis espectral
- **Filtrado Digital**: Filtro IIR de primer orden con coeficiente configurable
- **Visualización**: Gráficos en tiempo real usando Chart.js
- **Interfaz Moderna**: Diseño responsivo con Tailwind CSS

## 👥 Integrantes

- Cesar Andres Muñoz Toro
- Paula Jizeth Triana Herrera
- Marleydys Selene Daza Sabalza

**Docente**: Juan Sebastián Cortés Cruz

## 🎯 Características

### Motor DSP
- **FFT**: Análisis espectral de señales de tráfico
- **Filtro IIR**: Suavizado adaptativo con ecuación: `y[n] = x[n] + a·y[n-1]`
- **Análisis de Estabilidad**: Validación de polos dentro del círculo unitario

### Patrones de Tráfico
1. **Patrón CUN**: Modelado basado en horarios académicos
2. **Ráfagas / DDoS**: Picos intensos de tráfico
3. **Ciclo Diurno**: Variación periódica 24 horas
4. **Salto de Carga**: Cambios abruptos de demanda

### Funcionalidades
- Ingreso de datos personalizados (.csv, .txt, .json)
- Exportación de resultados a CSV
- Controles interactivos en tiempo real
- Visualización del plano Z y círculo unitario
- Estadísticas de eficacia de filtrado

## 🛠️ Tecnologías

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Gráficos**: Chart.js
- **Iconos**: Lucide Icons
- **CSS Framework**: Tailwind CSS
- **Matemáticas**: KaTeX para fórmulas

## 📁 Estructura

```
proyecto.html          # Archivo HTML único con toda la aplicación
.gitignore            # Archivos a ignorar en git
README.md             # Este archivo
```

## 🚀 Uso

### Opción 1: Abrir directamente
```bash
# En Windows
start proyecto.html

# En macOS
open proyecto.html

# En Linux
firefox proyecto.html
```

### Opción 2: Usar un servidor local
```bash
# Con Python 3
python -m http.server 8000

# Con Node.js
npx serve
```

Luego accede a `http://localhost:8000/proyecto.html`

## 📊 Ejemplos de Datos de Prueba

### 10 Datos Básicos
```
54.2, 58.1, 62.4, 59.8, 71.0, 68.3, 55.4, 49.2, 85.0, 77.2
```

### Dataset Ráfaga Intensa
Generad automáticamente con el botón "Ráfaga Intensa (60 pts)"

### Dataset Ciclo Diurno
Simula el patrón de tráfico en 24 horas

## 📐 Marco Teórico

### Función de Transferencia
$$H(z) = \frac{1}{1 - a \cdot z^{-1}}$$

### Ecuación en Diferencias
$$y[n] = x[n] + a \cdot y[n-1]$$

### Criterio de Estabilidad
El filtro es estable si el polo $z = a$ cumple: $|a| < 1$

## 🔧 Configuración

- **Muestras (N)**: Número de puntos en la ventana de análisis (256-2048)
- **Frecuencia Fs**: Tasa de muestreo (Hz)
- **Coeficiente a**: Factor de retroalimentación del filtro (0-1)
- **Ruido Gaussiano**: Nivel de perturbación aleatoria

## 📝 Notas Importantes

- La FFT requiere que N sea potencia de 2
- La frecuencia de Nyquist es Fs/2
- Valores de `a` cercanos a 1 producen mayor suavizado
- El atenuante de varianza indica eficacia del filtrado

## 📚 Referencias

- **Ficha del Curso**: DIS31 / 54444
- **Institución**: CUN (Corporación Unificada Nacional de Educación Superior)
- **Período**: 2026

## 📄 Licencia

Este proyecto es de uso académico y está disponible para propósitos educativos.

---

**Última actualización**: 2026-08-28
