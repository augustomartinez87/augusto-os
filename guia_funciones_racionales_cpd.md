# Polinomios y funciones racionales: guía de estudio

## Por qué este texto

Este material acompaña la presentación "¿Cuánto vale hoy un cheque que vence en 90 días?". Sirve para entender, desde cero, los conceptos matemáticos que sostienen esa presentación: polinomio, coeficiente, grado, función racional, dominio y asíntota. Cada concepto se explica primero de forma abstracta y después se aplica al mismo ejemplo (el descuento de un cheque de pago diferido), para que la idea matemática y la aplicación financiera queden conectadas en la cabeza de una sola vez.

El orden importa: cada sección se apoya en la anterior. Conviene leerlas en orden la primera vez.

---

## 1. ¿Qué es un polinomio?

Un **polinomio** es una expresión que se arma sumando (o restando) términos, donde cada término es un número multiplicado por una variable elevada a una potencia entera no negativa (0, 1, 2, 3...).

Forma general de un polinomio en la variable x:

P(x) = aₙxⁿ + aₙ₋₁xⁿ⁻¹ + ... + a₁x + a₀

Donde cada aᵢ es un número real fijo.

**Ejemplos de polinomios:**
- P(x) = 3x² + 5x − 2
- P(x) = 7x − 1
- P(x) = 4  (un polinomio puede ser una sola constante)

**Ejemplos que NO son polinomios:**
- 1/x  (la variable está dividiendo, no elevada a una potencia entera no negativa)
- √x  (equivale a x elevado a 1/2, una potencia no entera)
- 2ˣ  (la variable está en el exponente, no en la base)

Un polinomio, entonces, es simplemente una "suma de potencias de x", cada una acompañada de un número.

---

## 2. Coeficientes

Cada número que multiplica a una potencia de x se llama **coeficiente**.

En P(x) = 3x² + 5x − 2:
- 3 es el coeficiente de x² 
- 5 es el coeficiente de x
- −2 es el **término independiente** (el coeficiente de x⁰, porque x⁰ = 1)

El coeficiente que acompaña a la potencia más alta se llama **coeficiente principal**. En el ejemplo anterior, el coeficiente principal es 3.

Los coeficientes son los que determinan la forma concreta de la función: dos polinomios pueden tener el mismo grado pero comportarse de manera muy distinta según el valor de sus coeficientes. Por ejemplo, 3x² no es lo mismo que 300x², aunque ambos sean "de grado 2": el segundo crece mucho más rápido.

---

## 3. Grado de un polinomio

El **grado** de un polinomio es el exponente más alto que aparece en la expresión (siempre que su coeficiente no sea cero).

- P(x) = 3x² + 5x − 2 → grado 2 (cuadrático)
- P(x) = 7x − 1 → grado 1 (lineal)
- P(x) = 4 → grado 0 (constante)

El grado es importante porque anticipa el comportamiento de la función: a medida que x crece mucho (positivo o negativo), un polinomio de grado más alto "domina" y crece más rápido que uno de grado más bajo.

---

## 4. ¿Qué es una función racional?

Una **función racional** es el cociente (la división) de dos polinomios:

f(x) = P(x) / Q(x)

Donde P(x) es el polinomio del numerador y Q(x) es el polinomio del denominador.

**Ejemplos de funciones racionales:**
- f(x) = (x + 1) / (x − 3)
- f(x) = 5 / (2x + 1)
- f(x) = (x² − 4) / (x + 2)

La diferencia clave con un polinomio "normal" es que ahora hay una división de por medio, y las divisiones tienen una restricción que los polinomios solos no tienen: **no se puede dividir por cero**.

---

## 5. Dominio de una función racional

El **dominio** de una función es el conjunto de todos los valores de x para los cuales la función está definida (es decir, para los cuales se puede calcular un resultado).

En una función racional f(x) = P(x)/Q(x), el único problema posible es que el denominador se anule, porque dividir por cero no tiene resultado matemático. Por eso:

**Dominio de f(x) = P(x)/Q(x): todos los x reales tales que Q(x) ≠ 0**

Para encontrar el dominio en la práctica, hay que preguntarse: "¿para qué valores de x el denominador da cero?" y excluir esos valores.

**Ejemplo:** en f(x) = 1/(x − 3), el denominador se anula cuando x = 3 (porque 3 − 3 = 0). Entonces el dominio son todos los reales excepto x = 3.

---

## 6. Asíntotas

Una **asíntota** es una recta a la que la función se acerca cada vez más, sin llegar a tocarla nunca (o tocándola solo en casos especiales), a medida que x se aleja o se acerca a un valor problemático.

Hay dos tipos principales, relevantes para este tema:

**Asíntota vertical:** ocurre cerca de los valores de x que anulan el denominador. La función "se dispara" hacia +∞ o −∞ a medida que x se acerca a ese punto.

**Asíntota horizontal:** describe qué pasa con f(x) cuando x se hace muy grande (tiende a +∞) o muy chico (tiende a −∞). Si el grado del numerador es menor o igual al del denominador, la función tiende a un valor constante (a veces cero), y esa constante es la asíntota horizontal.

En el ejemplo f(x) = 1/(x − 3): hay una asíntota vertical en x = 3, y una asíntota horizontal en y = 0 (porque a medida que x crece mucho, 1 dividido un número cada vez más grande se acerca a cero).

---

## 7. Aplicación: el valor presente de un cheque

Ahora se conecta todo con el caso de la presentación.

Cuando una empresa descuenta un cheque de pago diferido (CPD), recibe hoy un monto menor al valor escrito en el cheque, porque está cobrando antes de la fecha de vencimiento. La fórmula que calcula ese valor presente (con descuento simple) es:

**VP(t) = VN / (1 + r·t)**

Donde:
- VP(t): valor presente que recibe la empresa hoy, en función del plazo t
- VN: valor nominal del cheque (el monto escrito, por ejemplo $10.000.000)
- r: tasa de descuento anual (por ejemplo 25%, expresada como 0,25)
- t: plazo hasta el vencimiento, expresado en años (por ejemplo, 90 días = 90/365 años)

**¿Por qué esta fórmula es una función racional?**

- El numerador es VN, un número constante: se puede pensar como un polinomio de grado 0 (una constante).
- El denominador es (1 + r·t), un polinomio de grado 1 en la variable t (porque t aparece elevado a la potencia 1, multiplicado por el coeficiente r, más el término independiente 1).
- Como VP(t) es el cociente entre esos dos polinomios, es, por definición, una función racional.

**Dominio en este contexto:**

Matemáticamente, el denominador (1 + r·t) se anula cuando t = −1/r, un valor negativo (porque r es positivo). Ese punto queda fuera del dominio matemático de la función. Pero en el contexto financiero, t representa un plazo, y un plazo no puede ser negativo. Por eso, el dominio que importa en la práctica es t ≥ 0: no hay ningún problema de división por cero para los plazos reales que puede tener un cheque.

**Asíntota horizontal:**

A medida que el plazo t crece mucho (un cheque a muy largo plazo), el denominador (1 + r·t) crece cada vez más, y por lo tanto VP(t) se acerca cada vez más a cero, sin llegar a tocarlo. Esa es la asíntota horizontal en y = 0: por más que pase el tiempo, el valor presente nunca llega a ser exactamente cero ni negativo, pero se vuelve cada vez más chico.

**Lectura económica:**

Esto tiene una traducción financiera directa: cuanto mayor es el plazo de un cheque, menor es el valor que se recibe hoy al descontarlo, porque hay más tiempo de espera involucrado y por lo tanto más descuento. La matemática (una función decreciente con asíntota horizontal en cero) describe exactamente ese comportamiento económico.

---

## 8. Ejemplo numérico completo

Cheque de $10.000.000, tasa de descuento del 25% anual (TNA), a 90 días.

VP(90) = 10.000.000 / (1 + 0,25 · (90/365))

VP(90) = 10.000.000 / (1 + 0,0616)

VP(90) = 10.000.000 / 1,0616

**VP(90) ≈ $9.419.355**

Esto significa que la empresa recibe hoy $9.419.355 en lugar de esperar 90 días para cobrar $10.000.000. La diferencia, $580.645, es el costo del descuento (equivalente a la tasa de interés que cobra quien adelanta el dinero).

Si se repite el mismo cálculo con plazos más largos (180, 270, 365 días), el valor presente sigue bajando, acercándose cada vez más a $8.000.000 al año, pero sin cruzar hacia abajo de ese comportamiento decreciente ni estabilizarse antes de tiempo: es la función racional actuando.

---

## 9. Resumen para repasar antes del examen

- Un **polinomio** es una suma de potencias de x, cada una con un coeficiente.
- El **coeficiente** es el número que acompaña a cada potencia; el **coeficiente principal** acompaña a la potencia más alta.
- El **grado** es el exponente más alto del polinomio.
- Una **función racional** es un cociente de dos polinomios: f(x) = P(x)/Q(x).
- El **dominio** de una función racional excluye los valores de x que anulan el denominador.
- Una **asíntota** es una recta a la que la función se acerca sin tocarla; puede ser vertical (cerca de un valor prohibido del dominio) u horizontal (cuando x crece o decrece sin límite).
- VP(t) = VN/(1 + r·t) es una función racional porque es el cociente entre un polinomio constante (VN) y uno de grado 1 en t (1 + r·t).
- Su asíntota horizontal en 0 explica, matemáticamente, por qué a mayor plazo el valor presente de un cheque es cada vez menor, pero nunca llega a cero.
